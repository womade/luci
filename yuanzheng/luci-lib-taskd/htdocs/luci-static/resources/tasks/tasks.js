
(function(){
    const taskd={};
    const $gettext = function(str) {
        return taskd.i18n[str] || str;
    };
    const request = function(url, method, data) {
        return new Promise((resolve, reject) => {
            var oReq = new XMLHttpRequest();
            oReq.open(method || 'GET', url, true);

            oReq.onload = function (oEvent) {
                resolve(oReq.responseText);
            };
            if (method=='POST') {
                oReq.setRequestHeader("Content-type", "application/x-www-form-urlencoded");
            }
            oReq.send(data || method=='POST'?"token="+taskd.csrfToken:null);
        });
    };
    const getBin = function(url) {
        return new Promise((resolve, reject) => {
            var oReq = new XMLHttpRequest();
            oReq.open("GET", url, true);
            oReq.responseType = "arraybuffer";
    
            oReq.onload = function (oEvent) {
                resolve({status: oReq.status, buffer: new Uint8Array(oReq.response)});
            };
            
            oReq.send(null);
        });
    };
    const getTaskDetail = function(task_id) {
        return request("/cgi-bin/luci/admin/system/tasks/status?task_id="+task_id).then(data=>JSON.parse(data));
    };
    const create_dialog = function(cfg) {
        const container = document.createElement('div');
        container.id = "tasks_detail_container";
        container.innerHTML = taskd.dialog_template;

        document.body.appendChild(container);
        const title_view = container.querySelector(".dialog-title-bar .dialog-title");
        title_view.innerText = cfg.title;

        const term = new Terminal({convertEol: cfg.convertEol||false});
        if (cfg.nohide) {
            container.querySelector(".dialog-icon-min").hidden = true;
        } else {
            container.querySelector(".dialog-icon-min").onclick = function(){
                container.hidden=true;
                term.dispose();
                document.body.removeChild(container);
                cfg.onhide && cfg.onhide();
                return false;
            };
        }
        term.open(document.getElementById("tasks_xterm_log"));

        return {term,container};
    };
    const show_log_txt = function(title, content, onclose) {
        const dialog = create_dialog({title, convertEol:true, onhine:onclose});
        const container = dialog.container;
        const term = dialog.term;
        container.querySelector(".dialog-icon-close").hidden = true;
        term.write(content);
    };
    const show_log = function(task_id, nohide) {
        let showing = true;
        let running = true;
        const dialog = create_dialog({title:task_id, nohide, onhide:function(){showing=false;}});
        const container = dialog.container;
        const term = dialog.term;

        const title_view = container.querySelector(".dialog-title-bar .dialog-title");
        container.querySelector(".dialog-icon-close").onclick = function(){
            if (!running || confirm($gettext("Stop running task?"))) {
                running=false;
                showing=false;
                del_task(task_id).then(()=>{
                    location.href = location.href;
                });
            }
            return false;
        };
        const checkTask = function() {
            return getTaskDetail(task_id).then(data=>{
                if (!running) {
                    return false;
                }
                running = data.running;
                let title = task_id;
                if (!data.running && data.stop) {
                    title += " (" + (data.exit_code?$gettext("Failed at:"):$gettext("Finished at:")) + " " + new Date(data.stop * 1000).toLocaleString() + ")";
                }
                title += " > " + (data.command || '');
                title_view.title = title;
                title_view.innerText = title;
                if (!data.running) {
                    container.classList.add('tasks_stopped')
                    if (data.exit_code) {
                        container.classList.add('tasks_failed')
                    }
                }
                // last pull
                return showing;
            });
        };
        let logoffset = 0;
        const pulllog = function() {
            getBin("/cgi-bin/luci/admin/system/tasks/log?task_id="+task_id+"&offset="+logoffset).then(function(res){
                if (!showing) {
                    return false;
                }
                switch(res.status){
                    case 205:
                        term.reset();
                        logoffset = 0;
                        return running;
                        break;
                    case 204:
                        return running && checkTask();
                        break;
                    case 200:
                        logoffset += res.buffer.byteLength;
                        term.write(res.buffer);
                        return running;
                        break;
                }
            }).then(again => {
                if (again) {
                    setTimeout(pulllog, 0);
                }
            });
        };
        checkTask().then(pulllog);
    };
    const del_task = function(task_id) {
        return request("/cgi-bin/luci/admin/system/tasks/stop?task_id="+task_id, "POST");
    };
    taskd.show_log = show_log;
    taskd.remove = del_task;
    taskd.show_log_txt = show_log_txt;
    window.taskd=taskd;
})();

(function(){
    // compat
    if (typeof(window.findParent) !== 'function') {
        const elem = function(e) {
			return (e != null && typeof(e) == 'object' && 'nodeType' in e);
		};
        const matches = function(node, selector) {
			var m = elem(node) ? node.matches || node.msMatchesSelector : null;
			return m ? m.call(node, selector) : false;
		};
        window.findParent = function (node, selector) {
	        if (elem(node) && node.closest)
				return node.closest(selector);

			while (elem(node))
				if (matches(node, selector))
					return node;
				else
					node = node.parentNode;

			return null;
        };
    }
    if (typeof(window.cbi_submit) !== 'function') {
        const makeHidden = function(name) {
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = name;
            return input;
        };
        window.cbi_submit = function(elem, name, value, action) {
            var form = elem.form || findParent(elem, 'form');

            if (!form)
                return false;

            if (action)
                form.action = action;

            if (name) {
                var hidden = form.querySelector('input[type="hidden"][name="%s"]'.format(name)) ||
                    makeHidden(name);

                hidden.value = value || '1';
                form.appendChild(hidden);
            }

            form.submit();
            return true;
        };
    }
})();