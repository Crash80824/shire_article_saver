// ==UserScript==
// @name         shire article saver
// @namespace    http://tampermonkey.net/
// @version      0.4.2.1
// @description  Download shire thread content.
// @author       Crash
// @match        https://www.shireyishunjian.com/*
// @match        https://www.shishirere.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=shireyishunjian.com
// @grant        unsafeWindow
// @grant        GM.getValue
// @grant        GM.setValue
// ==/UserScript==

(function () {
    'use strict';

    const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1 Edg/125.0.0.0';

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

    const getPostId = post => post.id.slice(5);

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
        const post_in_page = qSA('[class^="plhin post_gender"]', postlist);

        let text = '';
        for (let post of post_in_page) {
            post = post.parentNode;
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
            case 'page': {
                let filename = title_name;
                let content = file_info;
                const author = getThreadAuthorInfo();
                const is_only_author = location.href.parseURL().authorid == author.id;
                if (is_only_author) {
                    filename += `（${author.name}）`;
                }
                else {
                    filename += '（全文）';
                }


                const page_num = (qS('#pgt > div > div > label > span') || { 'title': '共 1 页' }).title.match(/共 (\d+) 页/)[1];
                for (let page_id = 1; page_id <= page_num; page_id++) {
                    const http_request = new XMLHttpRequest();
                    let url = `https://${location.host}/main/forum.php?mod=viewthread&tid=${thread_id}&page=${page_id}`;
                    if (is_only_author) {
                        url += `&authorid=${author.id}`;
                    }
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


    function updateGMListElements(list, elem, status) {
        if (status && !list.includes(elem)) {
            list.push(elem);
        }
        if (!status && list.includes(elem)) {
            list.splice(list.indexOf(elem), 1);
        }
        return list;
    }

    async function updateGMList(list_name, list) {
        if (list.length == 0) {
            GM.deleteValue(list_name);
        }
        else {
            GM.setValue(list_name, list);
        }
    }

    // 根据checkbox的状态更新value对应的数组
    // value/id: tid/pid, uid/tid
    unsafeWindow.recordCheckbox = async function (value, id, checked) {
        let checked_list = await GM.getValue(value, []);
        id = id.split('_check_')[1];
        checked_list = updateGMListElements(checked_list, id, checked);
        updateGMList(value, checked_list);
    }

    unsafeWindow.changePageAllCheckboxs = async function () {
        const tid = location.href.parseURL().tid;
        const checkbox_page = qS('#page_checked_all');
        const checked_for_all = checkbox_page.checked;
        const checkbox_posts = qSA('input[id^="post_check_"]');
        let checked_list = await GM.getValue(`${tid}_checked_posts`, []);
        for (let checkbox of checkbox_posts) {
            checkbox.checked = checked_for_all;
            const id = checkbox.id.split('_check_')[1];
            checked_list = updateGMListElements(checked_list, id, checked_for_all);
        }
        updateGMList(`${tid}_checked_posts`, checked_list);
    }

    // 关注某个用户在某个Thread下的回复
    // 若tid==0，则关注用户的所有主题
    // 若tid==-1, 则关注用户的所有回复
    unsafeWindow.recordFollow = async function (uid, tid, followed) {
        let follow_threads = await GM.getValue(uid + '_follow_threads', []);
        follow_threads = updateGMListElements(follow_threads, tid, followed);
        updateGMList(uid + '_follow_threads', follow_threads);
    };

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
        const post_in_page = qSA('[class^="plhin post_gender"]', qS('#postlist'));
        let all_checked = true;

        for (let post of post_in_page) {
            post = post.parentNode;
            const pid = post.id.split('post_')[1];
            const label = document.createElement('label');
            const label_text = document.createTextNode('保存本层');
            label.className = 'x1 xl2 o cl';
            label.appendChild(label_text);
            qS('tbody > tr:nth-child(1) > td.pls > div', post).appendChild(label);

            const checkbox = document.createElement('input');
            checkbox.id = 'post_check_' + pid;
            checkbox.type = 'checkbox';
            checkbox.checked = checked_posts.includes(pid);
            checkbox.addEventListener('change', () => { unsafeWindow.recordCheckbox(`${tid}_checked_posts`, checkbox.id, checkbox.checked) });// 每个Thread设置一个数组，存入被选中的Post的ID
            label.appendChild(checkbox);

            all_checked = all_checked && checkbox.checked;
        }

        const label = document.createElement('label');
        const label_text = document.createTextNode(all_checked ? '清空全选' : '全选本页');
        label.appendChild(label_text);
        qS('#postlist > table:nth-child(1) > tbody > tr > td.plc.ptm.pbn.vwthd > div').appendChild(label);

        const checkbox = document.createElement('input');
        checkbox.id = 'page_checked_all';
        checkbox.type = 'checkbox';
        checkbox.checked = all_checked;
        checkbox.setAttribute('onchange', 'window.changePageAllCheckboxs()');
        label.appendChild(checkbox);
    }

    async function insertSpaceCheckbox() {
        const uid = location.href.parseURL().uid;
        const checked_threads = await GM.getValue(uid + '_checked_threads', []);
        const thread_in_page = qSA('tr:not(.th)', qS('#delform > table > tbody'));

        for (let thread of thread_in_page) {
            const link = qS('th > a', thread)
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

            checkbox.addEventListener('change', () => { unsafeWindow.recordCheckbox(`${uid}_checked_threads`, checkbox.id, checkbox.checked) });// 每个用户设置一个数组，存入被选中的Thread的ID
        }
    }

    function modifyPostPage() {
        const author = getThreadAuthorInfo();
        const is_only_author = location.href.parseURL().authorid == author.id;

        insertPostCheckbox();

        if (isFirstPage()) {
            insertLink('保存主楼  ', 'window.saveThread()', qS('#postlist > div > table > tbody > tr:nth-child(1) > td.plc > div.pi > strong'));

            if (is_only_author) {
                insertLink('保存作者  ', 'window.saveThread("page")', qS('#postlist > table:nth-child(1) > tbody > tr > td.plc.ptm.pbn.vwthd > div'));
            }
            else {
                insertLink('保存全文  ', 'window.saveThread("page")', qS('#postlist > table:nth-child(1) > tbody > tr > td.plc.ptm.pbn.vwthd > div'));
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
    const isNotMobile = locationParams.mobile == 'no' || Array.from(qSA('meta')).some(meta => meta.getAttribute('http-equiv') === 'X-UA-Compatible');

    if (!isNotMobile) {
        return;
    }

    if (hasReadPermission()) {
        if (locationParams.loc == 'forum' && locationParams.mod == 'viewthread') {
            modifyPostPage();
        }

        if (locationParams.loc == 'home' && locationParams.mod == 'space') {
            modifySpacePage();
        }
    }

})();
