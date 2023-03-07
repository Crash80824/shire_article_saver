// ==UserScript==
// @name         shire article saver
// @namespace    http://tampermonkey.net/
// @version      0.2.1.1
// @description  Download shire thread content.
// @author       Crash
// @match        https://www.shireyishunjian.com/main/forum.php?mod=viewthread*
// @match        https://www.shishirere.com/main/forum.php?mod=viewthread*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=shireyishunjian.com
// @grant        unsafeWindow
// ==/UserScript==

(function () {
    'use strict';

    const $ = (selector, parent = document) => parent.querySelector(selector);
    const $$ = (selector, parent = document) => parent.querySelectorAll(selector);

    function getPostContent(pid, page_doc = document) {
        const tf = $('#postmessage_' + pid, page_doc);
        let childrenNodes = tf.childNodes;
        let content = '';
        for (let i = 0; i < childrenNodes.length; i++) {
            const child = childrenNodes[i];
            switch (child.tagName + '.' + child.className) {
                case 'DIV.quote':
                    content += '<<<\n';
                    let quote_href = $('td > div > blockquote > font > a', child);
                    if (quote_href) {
                        let origin_quote = quote_href.innerText;
                        quote_href.innerText += ' ' + quote_href.href.match(/pid=\d*/)[0].replace('pid=', 'PID: ');
                        content += child.textContent + '\n';
                        quote_href.innerText = origin_quote;
                    }
                    else {
                        content += child.textContent + '\n'
                    }
                    content += '>>>\n';
                    break;
                case 'HR.l':
                    content += '++++++++\n';
                    break;
                default:
                    content += child.textContent;
            }
        }
        return content;
    }

    function getPostInfo(post, page_doc = document) {
        const post_id = post.id.split('_')[1];
        const thread_id = $('#postlist > table:nth-child(1) > tbody > tr > td.plc.ptm.pbn.vwthd > span > a', page_doc).href.split('tid=')[1];
        const post_auth = $('#favatar' + post_id + ' > div.pi > div > a', post).text;
        const post_auth_id = $('#favatar' + post_id + ' > div.pi > div > a', post).href.split('uid=')[1];
        const sub_time = $('[id^=authorposton]', post).textContent;
        const post_url = `${page_doc.baseURI}forum.php?mod=redirect&goto=findpost&ptid=${thread_id}&pid=${post_id}`;
        const post_content = getPostContent(post_id, page_doc);

        return { 'post_id': post_id, 'post_auth': post_auth, 'post_auth_id': post_auth_id, 'sub_time': sub_time, 'post_url': post_url, 'post_content': post_content };
    }

    function getPageContent(page_doc, type = 'main') {
        const postlist = $('#postlist', page_doc);
        const post_in_page = $$('[class^=post_gender]', postlist);

        let post_num = 1;
        if (type == 'page') { post_num = post_in_page.length; }

        let content = '';
        for (let i = 0; i < post_num; i++) {
            const post_info = getPostInfo(post_in_page[i], page_doc);
            if (type != 'main') { content += '<----------------\n'; }
            content += `//${post_info.post_auth}(UID: ${post_info.post_auth_id}) ${post_info.sub_time}\n`;
            content += `//PID:${post_info.post_id}\n`;
            content += post_info.post_content;
            if (type != 'main') { content += '\n---------------->\n'; }
        }
        return content;
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

    unsafeWindow.saveThread = function (type = 'main') {
        const thread_id = $('#postlist > table:nth-child(1) > tbody > tr > td.plc.ptm.pbn.vwthd > span > a').href.split('tid=')[1];
        let title_name = $('#thread_subject').parentNode.textContent.replaceAll('\n', '').replaceAll('[', '【').replaceAll(']', '】');
        let file_info = `Link: ${location.href}\n****************\n`;

        switch (type) {
            case 'main': {
                let filename = title_name;
                let content = file_info;
                content += getPageContent(document, 'main');
                saveFile(filename, content);
            }
                break;
            case 'thread': {
                let filename = title_name + '（全帖）';
                let content = file_info;
                const page_num = ($('#pgt > div > div > label > span') || { 'title': '共 1 页' }).title.replace('共 ', '').replace(' 页', '');
                for (let page_id = 1; page_id <= page_num; page_id++) {
                    const http_request = new XMLHttpRequest();
                    const url = `https://${location.host}/main/forum.php?mod=viewthread&tid=${thread_id}&extra=&authorid=${thread_auth_id}&page=${page_id}`;
                    http_request.open('GET', url, false);
                    http_request.send()

                    const page_doc = new DOMParser().parseFromString(http_request.responseText, 'text/html');
                    const page_content = getPageContent(page_doc, 'page');
                    content += page_content;

                }
                saveFile(filename, content);
            }
                break;
        }
    }

    const is_fisrt_page = !location.href.match(/page=([2-9]|[1-9]\d+)/);
    let thread_auth_name = '';
    let thread_auth_id = '';
    if (is_fisrt_page) {
        const first_post_info = getPostInfo($('#postlist > div'));
        thread_auth_name = first_post_info.post_auth;
        thread_auth_id = first_post_info.post_auth_id;
    }
    else {
        thread_auth_name = $('#tath > a:nth-child(1)').title;
        thread_auth_id = $('#tath > a:nth-child(1)').href.split('uid=')[1];
    }


    if (is_fisrt_page) {
        const download_pos = $('table > tbody > tr:nth-child(1) > td.plc > div.pi > strong', $('#postlist > div'));
        const download_href = document.createElement('a');
        download_href.innerHTML = '保存主楼';
        download_href.href = 'javascript:void(0)';
        download_href.setAttribute('onclick', 'window.saveThread()');
        download_pos.appendChild(download_href);
    }

    if (location.href.includes('authorid=' + thread_auth_id) && is_fisrt_page) {
        const download_pos = $('#postlist > table:nth-child(1) > tbody > tr > td.plc.ptm.pbn.vwthd > div')
        const download_href = document.createElement('a');
        download_href.innerHTML = '保存全帖';
        download_href.href = 'javascript:void(0)';
        download_href.setAttribute('onclick', 'window.saveThread("thread")');
        download_pos.appendChild(download_href);
    }
})();
