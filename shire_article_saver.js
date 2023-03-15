// ==UserScript==
// @name         shire article saver
// @namespace    http://tampermonkey.net/
// @version      0.3.0.1
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

    const $ = (selector, parent = document) => parent.querySelector(selector);
    const $$ = (selector, parent = document) => parent.querySelectorAll(selector);

    const isFirstPage = () => !location.href.match(/page=([2-9]|[1-9]\d+)/);
    const hasThreadInPage = (doc = document) => $('#delform > table > tbody > tr:not(.th)', doc).childNodes.length > 3;

    function getThreadAuthorInfo() {
        let thread_auth_name = '';
        let thread_auth_id = '';
        if (isFirstPage()) {
            const first_post_info = getPostInfo($('#postlist > div'));
            thread_auth_name = first_post_info.post_auth;
            thread_auth_id = first_post_info.post_auth_id;
        }
        else {
            thread_auth_name = $('#tath > a:nth-child(1)').title;
            thread_auth_id = $('#tath > a:nth-child(1)').href.split('uid=')[1];
        }
        return { 'name': thread_auth_name, 'id': thread_auth_id };
    }

    function getPostContent(pid, page_doc = document) {
        const tf = $('#postmessage_' + pid, page_doc);
        let childrenNodes = tf.childNodes;
        let text = '';
        for (let child of childrenNodes) {
            switch (child.tagName + '.' + child.className) {
                case 'DIV.quote':
                    {
                        text += '<<<\n';
                        let quote_href = $('td > div > blockquote > font > a', child);
                        if (quote_href) {
                            let origin_quote = quote_href.innerText;
                            quote_href.innerText += ' ' + quote_href.href.match(/pid=\d*/)[0].replace('pid=', 'PID: ');
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

    const getPostId = post => post.id.split('_')[1];

    function getPostInfo(post, page_doc = document) {
        const post_id = getPostId(post);
        const thread_id = $('#postlist > table:nth-child(1) > tbody > tr > td.plc.ptm.pbn.vwthd > span > a', page_doc).href.split('tid=')[1];
        const post_auth = $('#favatar' + post_id + ' > div.pi > div > a', post).text;
        const post_auth_id = $('#favatar' + post_id + ' > div.pi > div > a', post).href.split('uid=')[1];
        const sub_time = $('[id^=authorposton]', post).textContent;
        const post_url = `${page_doc.baseURI}forum.php?mod=redirect&goto=findpost&ptid=${thread_id}&pid=${post_id}`;
        const post_content = getPostContent(post_id, page_doc);
        const post_text = post_content.text;
        const post_image = post_content.image;


        return { 'post_id': post_id, 'post_auth': post_auth, 'post_auth_id': post_auth_id, 'sub_time': sub_time, 'post_url': post_url, 'post_text': post_text, 'post_image': post_image };
    }

    async function getPageContent(page_doc, type = 'main') {
        const postlist = $('#postlist', page_doc);
        const post_in_page = $$('[class^=post_gender]', postlist);

        let text = '';
        for (let post of post_in_page) {
            if (type == 'checked') {
                const checked = await GM.getValue('post_check_' + getPostId(post), false);
                if (!checked) {
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
        const thread_id = $('#postlist > table:nth-child(1) > tbody > tr > td.plc.ptm.pbn.vwthd > span > a').href.split('tid=')[1];
        let title_name = $('#thread_subject').parentNode.textContent.replaceAll('\n', '').replaceAll('[', '【').replaceAll(']', '】');
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
                const page_num = ($('#pgt > div > div > label > span') || { 'title': '共 1 页' }).title.replace('共 ', '').replace(' 页', '');
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
                const is_only_someone = location.href.match('authorid=[0-9]{1,}');
                const page_num = ($('#pgt > div > div > label > span') || { 'title': '共 1 页' }).title.replace('共 ', '').replace(' 页', '');
                for (let page_id = 1; page_id <= page_num; page_id++) {
                    const http_request = new XMLHttpRequest();
                    let url = `https://${location.host}/main/forum.php?mod=viewthread&tid=${thread_id}&page=${page_id}`;
                    if (is_only_someone) {
                        url += `&${is_only_someone[0]}`;
                    }
                    http_request.open('GET', url, false);
                    http_request.send()

                    const page_doc = new DOMParser().parseFromString(http_request.responseText, 'text/html');
                    const page_content = (await getPageContent(page_doc, 'checked')).text;
                    content += page_content;

                }
                saveFile(filename, content);

            }
                break;
        }
    }

    unsafeWindow.saveMergedThreads = async function () {
        const uid = location.href.match('uid=[0-9]{1,}')[0].split('=')[1];
        let checkedThreads = [];
        for (let page_id = 1; ; page_id++) {
            const http_request = new XMLHttpRequest();
            let url = `https://${location.host}/main/home.php?mod=space&uid=${uid}&do=thread&page=${page_id}`;

            http_request.open('GET', url, false);
            http_request.send();

            const page_doc = new DOMParser().parseFromString(http_request.responseText, 'text/html');
            if (!hasThreadInPage(page_doc)) {
                break;
            }

            const thread_in_page = $$('tr:not(.th)', $('#delform > table > tbody', page_doc));
            for (let thread of thread_in_page) {
                const link = $('th > a', thread);
                const tid = link.href.split('tid=')[1];

                if ((await GM.getValue('thread_check_' + tid, false)) == false) {
                    continue;
                }

                checkedThreads.push(tid);
            }
        }

        let filename = '合并贴';
        let content = '';
        for (let tid of checkedThreads.sort()) {
            const http_request = new XMLHttpRequest();
            const url = `https://${location.host}/main/forum.php?mod=viewthread&tid=${tid}`;

            http_request.open('GET', url, false);
            http_request.send();

            const thread_doc = new DOMParser().parseFromString(http_request.responseText, 'text/html');
            const thread_content = (await getPageContent(thread_doc, 'main')).text;
            content += thread_content;
        }
        saveFile(filename, content);
    }

    unsafeWindow.recordCheckbox = function (id, checked) {
        GM.setValue(id, checked);
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
        const post_in_page = $$('[class^=post_gender]', $('#postlist'));

        for (let post of post_in_page) {
            const pid = post.id.split('post_')[1];
            const label = document.createElement('label');
            const checked = await GM.getValue('post_check_' + pid, false) ? 'checked' : '';
            label.className = 'xl xl2 o cl';
            label.innerHTML = `保存本层 <input type='checkbox' class='pc' id='post_check_${pid}' ${checked} onchange='window.recordCheckbox(this.id, this.checked)'>`;
            $('tbody > tr:nth-child(1) > td.pls > div', post).appendChild(label);
        }
    }

    async function insertSpaceCheckbox() {
        const thread_in_page = $$('tr:not(.th)', $('#delform > table > tbody'));

        for (let thread of thread_in_page) {
            const link = $('th > a', thread);
            const tid = link.href.split('tid=')[1];
            const checkbox = document.createElement('input');
            checkbox.id = 'thread_check_' + tid;
            checkbox.type = 'checkbox';
            checkbox.className = 'pc';
            if (await GM.getValue('thread_check_' + tid, false)) {
                checkbox.checked = true;
            }
            checkbox.setAttribute('onchange', 'window.recordCheckbox(this.id, this.checked)');
            link.parentNode.insertBefore(checkbox, link);
        }
    }

    function modifyPostPage() {
        const author = getThreadAuthorInfo();
        const is_only_author = location.href.includes('authorid=' + author.id);

        insertPostCheckbox();

        if (isFirstPage()) {
            insertLink('保存主楼  ', 'window.saveThread()', $('#postlist > div > table > tbody > tr:nth-child(1) > td.plc > div.pi > strong'));

            if (is_only_author) {
                insertLink('保存作者  ', 'window.saveThread("author")', $('#postlist > table:nth-child(1) > tbody > tr > td.plc.ptm.pbn.vwthd > div'));
            }
        }

        insertLink('保存选中  ', 'window.saveThread("checked")', $('#postlist > table:nth-child(1) > tbody > tr > td.plc.ptm.pbn.vwthd > div'));
    }

    function modifySpacePage() {
        if (location.href.includes('do=thread')) {
            if (hasThreadInPage()) {
                insertSpaceCheckbox();
            }

            const pos = $('#delform > table > tbody > tr.th > th');
            insertLink('  合并保存选中', 'window.saveMergedThreads()', pos);
        }
    }

    if (location.href.includes('forum.php?mod=viewthread')) {
        modifyPostPage();
    }

    if (location.href.includes('home.php?mod=space')) {
        modifySpacePage();
    }
})();
