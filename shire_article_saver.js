// ==UserScript==
// @name         shire article saver
// @namespace    http://tampermonkey.net/
// @version      0.3.2.4
// @description  Download shire thread content.
// @author       Crash
// @match        https://www.shireyishunjian.com/main/forum.php?mod=viewthread*
// @match        https://www.shishirere.com/main/forum.php?mod=viewthread*
// @match        https://www.shireyishunjian.com/main/home.php?mod=space*
// @match        https://www.shishirere.com/main/home.php?mod=space*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=shireyishunjian.com
// @grant        unsafeWindow
// @grant        GM.getValue
// @grant        GM.setValue
// ==/UserScript==

(function () {
    'use strict';

    const qS = (selector, parent = document) => parent.querySelector(selector);
    const qSA = (selector, parent = document) => parent.querySelectorAll(selector);
    String.prototype.parseURL = function () {
        let obj = {};
        this.replace(/([^?=&#]+)=([^?=&#]+)/g, (_, key, value) => { obj[key] = value });
        this.replace(/#([^?=&#]+)/g, (_, hash) => { obj.hash = hash });
        this.replace(/(\w+)\.php/, (_, loc) => { obj.loc = loc });
        return obj;
    };

    const hasReadPermission = (doc = document) => !Boolean(qS('#messagetext', doc));
    const isFirstPage = (doc = document) => { const page = doc.URL.parseURL().page; return !Boolean(page) || page == 1; }
    const hasThreadInPage = (doc = document) => { const thread_list = qS('#delform > table > tbody > tr:not(.th)', doc); return Boolean(thread_list) && thread_list.childNodes.length > 3; }
    
    const getPostId = post => post.id.split('_')[1];
    
    function getPostContent(pid, page_doc = document) {
        const tf = qS('#postmessage_' + pid, page_doc);
        let childrenNodes = tf.childNodes;
        let text = '';
        for (let child of childrenNodes) {
            switch (child.tagName + '.' + child.className) {
                case 'DIV.quote':
                    {
                        text += '<<<\n';
                        let quote_href = qS('td > div > blockquote > font > a', child);
                        if (quote_href) {
                            let origin_quote = quote_href.innerText;
                            quote_href.innerText += ` PID:${quote_href.href.parseURL().pid}`;
                            text += child.textContent + '\n';
                            quote_href.innerText = origin_quote;
                        }
                        else {
                            text += child.textContent + '\n'
                        }
                        text += '>>>\n';
                    }
                    break;
                case 'HR.l':
                    text += '++++++++\n';
                    break;
                default:
                    text += child.textContent;
            }
        }
        return { 'text': text, 'image': [] }
    }
    
    function getPostInfo(post, page_doc = document) {
        const post_id = getPostId(post);
        const thread_id = qS('#postlist > table:nth-child(1) > tbody > tr > td.plc.ptm.pbn.vwthd > span > a', page_doc).href.parseURL().tid;
        const post_auth = qS('#favatar' + post_id + ' > div.pi > div > a', post).text;
        const post_auth_id = qS('#favatar' + post_id + ' > div.pi > div > a', post).href.parseURL().uid;
        const sub_time = qS('[id^=authorposton]', post).textContent;
        const post_url = `${page_doc.baseURI}forum.php?mod=redirect&goto=findpost&ptid=${thread_id}&pid=${post_id}`;
        const post_content = getPostContent(post_id, page_doc);
        const post_text = post_content.text;
        const post_image = post_content.image;


        return { 'post_id': post_id, 'post_auth': post_auth, 'post_auth_id': post_auth_id, 'sub_time': sub_time, 'post_url': post_url, 'post_text': post_text, 'post_image': post_image };
    }

    function getThreadAuthorInfo() {
        let thread_auth_name = '';
        let thread_auth_id = '';
        if (isFirstPage()) {
            const first_post_info = getPostInfo(qS('#postlist > div'));
            thread_auth_name = first_post_info.post_auth;
            thread_auth_id = first_post_info.post_auth_id;
        }
        else {
            thread_auth_name = qS('#tath > a:nth-child(1)').title;
            thread_auth_id = qS('#tath > a:nth-child(1)').href.parseURL().uid;
        }
        return { 'name': thread_auth_name, 'id': thread_auth_id };
    }

    async function getPageContent(page_doc, type = 'main') {
        const tid = page_doc.URL.parseURL().tid;
        const checked_posts = await GM.getValue(tid + '_checked_posts', []);
        const postlist = qS('#postlist', page_doc);
        const post_in_page = qSA('[class^=post_gender]', postlist);

        let text = '';
        for (let post of post_in_page) {
            if (type == 'checked') {
                const post_id = getPostId(post);
                if (!checked_posts.includes(post_id)) {
                    continue;
                }
            }
            const post_info = getPostInfo(post, page_doc);
            if (type != 'main') {
                text += '<----------------\n';
            }
            text += `//${post_info.post_auth}(UID: ${post_info.post_auth_id}) ${post_info.sub_time}\n`;
            text += `//PID:${post_info.post_id}\n`;
            text += post_info.post_text;
            if (type != 'main') {
                text += '\n---------------->\n';
            }
            if (type == 'main') {
                break;
            }
        }
        return { 'text': text, 'image': [] };
    }

    function saveFile(filename, content) {
        const buffer = new TextEncoder().encode(content).buffer;
        const blob = new Blob([buffer], { type: 'text/plain;base64' });
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onload = function (e) {
            const a = document.createElement('a');
            a.download = filename;
            a.href = e.target.result;
            a.click();
        };
    }

    unsafeWindow.saveThread = async function (type = 'main') {
        const thread_id = qS('#postlist > table:nth-child(1) > tbody > tr > td.plc.ptm.pbn.vwthd > span > a').href.parseURL().tid;
        let title_name = qS('#thread_subject').parentNode.textContent.replaceAll('\n', '').replaceAll('[', '【').replaceAll(']', '】');
        let file_info = `Link: ${location.href}\n****************\n`;

        switch (type) {
            case 'main': {
                let filename = title_name;
                let content = file_info;
                content += (await getPageContent(document, 'main')).text;
                saveFile(filename, content);
            }
                break;
            case 'author': {
                let filename = title_name + '（全贴）';
                let content = file_info;
                const author = getThreadAuthorInfo();
                const page_num = (qS('#pgt > div > div > label > span') || { 'title': '共 1 页' }).title.match(/共 (\d+) 页/)[1];
                for (let page_id = 1; page_id <= page_num; page_id++) {
                    const http_request = new XMLHttpRequest();
                    const url = `https://${location.host}/main/forum.php?mod=viewthread&tid=${thread_id}&authorid=${author.id}&page=${page_id}`;
                    http_request.open('GET', url, false);
                    http_request.send()

                    const page_doc = new DOMParser().parseFromString(http_request.responseText, 'text/html');
                    const page_content = (await getPageContent(page_doc, 'page')).text;
                    content += page_content;

                }
                saveFile(filename, content);
            }
                break;
            case 'checked': {
                let filename = title_name + '（节选）';
                let content = file_info;
                const specific_authorid = location.href.parseURL().authorid;
                const page_num = (qS('#pgt > div > div > label > span') || { 'title': '共 1 页' }).title.match(/共 (\d+) 页/)[1];
                for (let page_id = 1; page_id <= page_num; page_id++) {
                    const http_request = new XMLHttpRequest();
                    let url = `https://${location.host}/main/forum.php?mod=viewthread&tid=${thread_id}&page=${page_id}`;
                    if (specific_authorid) {
                        url += `&authorid=${specific_authorid}`;
                    }
                    http_request.open('GET', url, false);
                    http_request.send()

                    const page_doc = new DOMParser().parseFromString(http_request.responseText, 'text/html');
                    const page_content = (await getPageContent(page_doc, 'checked')).text;
                    content += page_content;

                }
                saveFile(filename, content);
                GM.deleteValue(thread_id + '_checked_posts');
            }
                break;
        }
    }

    unsafeWindow.saveMergedThreads = async function () {
        const uid = location.href.parseURL().uid;
        let checked_threads = await GM.getValue(uid + '_checked_threads', []);

        let filename = '合并贴';
        let content = '';
        for (let tid of checked_threads.sort()) {
            let thread_content = '';
            const http_request = new XMLHttpRequest();
            const url = `https://${location.host}/main/forum.php?mod=viewthread&tid=${tid}`;

            http_request.open('GET', url, false);
            http_request.send();

            const thread_doc = new DOMParser().parseFromString(http_request.responseText, 'text/html');
            if (hasReadPermission(thread_doc)) {
                thread_content += (await getPageContent(thread_doc, 'main')).text;
            }
            else {
                thread_content += '没有权限查看此贴\n';
            }
            content += thread_content;
        }
        saveFile(filename, content);
        GM.deleteValue(uid + '_checked_threads');
    }

    unsafeWindow.recordCheckbox = async function (value, id, checked) {
        let checked_list = await GM.getValue(value, []);
        id = id.split('_check_')[1];
        if (checked && !checked_list.includes(id)) {
            checked_list.push(id);
        }
        if (!checked && checked_list.includes(id)) {
            checked_list.splice(checked_list.indexOf(id), 1);
        }
        GM.setValue(value, checked_list);
    }

    function insertLink(text, func, pos, type = 'append') {
        const a = document.createElement('a');
        a.href = 'javascript:void(0)';
        a.textContent = text;
        a.setAttribute('onclick', func);

        switch (type) {
            case 'append':
                pos.appendChild(a);
                break;
            case 'insertBefore':
                pos.parentNode.insertBefore(a, pos);
                break;
            case 'insertAfter':
                pos.parentNode.insertBefore(a, pos.nextSibling);
                break;
        }
    }

    async function insertPostCheckbox() {
        const tid = location.href.parseURL().tid;
        const checked_posts = await GM.getValue(tid + '_checked_posts', []);
        const post_in_page = qSA('[class^=post_gender]', qS('#postlist'));

        for (let post of post_in_page) {
            const pid = post.id.split('post_')[1];
            const label = document.createElement('label');
            const checked = checked_posts.includes(pid) ? 'checked' : '';
            label.className = 'xl xl2 o cl';
            label.innerHTML = `保存本层 <input type='checkbox' class='pc' id='post_check_${pid}' ${checked} onchange='window.recordCheckbox("${tid}_checked_posts", this.id, this.checked)'>`;
            qS('tbody > tr:nth-child(1) > td.pls > div', post).appendChild(label);
        }
    }

    async function insertSpaceCheckbox() {
        const uid = location.href.parseURL().uid;
        const checked_threads = await GM.getValue(uid + '_checked_threads', []);
        const thread_in_page = qSA('tr:not(.th)', qS('#delform > table > tbody'));

        for (let thread of thread_in_page) {
            const link = qS('th > a', thread);
            const tid = link.href.parseURL().tid;
            const checkbox = document.createElement('input');
            checkbox.id = 'thread_check_' + tid;
            checkbox.type = 'checkbox';
            checkbox.className = 'pc';
            checkbox.checked = checked_threads.includes(tid);

            link.parentNode.insertBefore(checkbox, link);

            if (qS('td:nth-child(3) > a', thread).textContent == '保密存档') {
                checkbox.disabled = true;
                continue;
            }

            checkbox.setAttribute('onchange', `window.recordCheckbox("${uid}_checked_threads", this.id, this.checked)`);

        }
    }

    function modifyPostPage() {
        const author = getThreadAuthorInfo();
        const is_only_author = location.href.parseURL().authorid == author.id;

        insertPostCheckbox();

        if (isFirstPage()) {
            insertLink('保存主楼  ', 'window.saveThread()', qS('#postlist > div > table > tbody > tr:nth-child(1) > td.plc > div.pi > strong'));

            if (is_only_author) {
                insertLink('保存作者  ', 'window.saveThread("author")', qS('#postlist > table:nth-child(1) > tbody > tr > td.plc.ptm.pbn.vwthd > div'));
            }
        }

        insertLink('保存选中  ', 'window.saveThread("checked")', qS('#postlist > table:nth-child(1) > tbody > tr > td.plc.ptm.pbn.vwthd > div'));
    }

    function modifySpacePage() {
        let URL_info = location.href.parseURL();
        if (!Boolean(URL_info.type)) {
            URL_info.type = 'thread'
        }
        if (URL_info.do == 'thread' && URL_info.type == 'thread') {
            if (hasThreadInPage()) {
                insertSpaceCheckbox();
            }

            const pos = qS('#delform > table > tbody > tr.th > th');
            insertLink('  合并保存选中', 'window.saveMergedThreads()', pos);
        }
        if (qS('#toptb > div.z')) {
            const a = document.createElement('a');
            const uid = location.href.parseURL().uid;
            a.textContent = '主题';
            a.href = `https://${location.host}/main/home.php?mod=space&uid=${uid}&do=thread&from=space`;
            qS('#toptb > div.z').appendChild(a);
        }
    }

    const locationParams = location.href.parseURL();

    if (hasReadPermission()) {
        if (locationParams.loc == 'forum' && locationParams.mod == 'viewthread') {
            modifyPostPage();
        }

        if (locationParams.loc == 'home' && locationParams.mod == 'space') {
            modifySpacePage();
        }
    }

})();
