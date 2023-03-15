// ==UserScript==
// @name         shire article saver
// @namespace    http://tampermonkey.net/
// @version      0.2.1.4
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
        let text = '';
        for (let i = 0; i < childrenNodes.length; i++) {
            const child = childrenNodes[i];
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

    function getPostInfo(post, page_doc = document) {
        const post_id = post.id.split('_')[1];
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

    function getPageContent(page_doc, type = 'main') {
        const postlist = $('#postlist', page_doc);
        const post_in_page = $$('[class^=post_gender]', postlist);

        let post_num = 1;
        if (type == 'page') { post_num = post_in_page.length; }

        let text = '';
        for (let i = 0; i < post_num; i++) {
            const post_info = getPostInfo(post_in_page[i], page_doc);
            if (type != 'main') { text += '<----------------\n'; }
            text += `//${post_info.post_auth}(UID: ${post_info.post_auth_id}) ${post_info.sub_time}\n`;
            text += `//PID:${post_info.post_id}\n`;
            text += post_info.post_text;
            if (type != 'main') { text += '\n---------------->\n'; }
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

    unsafeWindow.saveThread = function (type = 'main') {
        const thread_id = $('#postlist > table:nth-child(1) > tbody > tr > td.plc.ptm.pbn.vwthd > span > a').href.split('tid=')[1];
        let title_name = $('#thread_subject').parentNode.textContent.replaceAll('\n', '').replaceAll('[', '【').replaceAll(']', '】');
        let file_info = `Link: ${location.href}\n****************\n`;

        switch (type) {
            case 'main': {
                let filename = title_name;
                let content = file_info;
                content += getPageContent(document, 'main').text;
                saveFile(filename, content);
            }
                break;
            case 'thread': {
                let filename = title_name + '（全贴）';
                let content = file_info;
                const page_num = ($('#pgt > div > div > label > span') || { 'title': '共 1 页' }).title.replace('共 ', '').replace(' 页', '');
                for (let page_id = 1; page_id <= page_num; page_id++) {
                    const http_request = new XMLHttpRequest();
                    const url = `https://${location.host}/main/forum.php?mod=viewthread&tid=${thread_id}&extra=&authorid=${thread_auth_id}&page=${page_id}`;
                    http_request.open('GET', url, false);
                    http_request.send()

                    const page_doc = new DOMParser().parseFromString(http_request.responseText, 'text/html');
                    const page_content = getPageContent(page_doc, 'page').text;
                    content += page_content;

                }
                saveFile(filename, content);
            }
                break;
        }
    }

    function insertLink(text, func, pos, sister = null) {
        const a = document.createElement('a');
        a.href = 'javascript:void(0)';
        a.textContent = text;
        a.setAttribute('onclick', func);
        if (sister) {
            sister.parentNode.insertBefore(a, sister);
        } else {
            pos.appendChild(a);
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

    const is_only_author = location.href.includes('authorid=' + thread_auth_id);

    if (is_fisrt_page) {
        insertLink('保存主楼', 'window.saveThread()', $('#postlist > div > table > tbody > tr:nth-child(1) > td.plc > div.pi > strong'));
    }

    if (is_only_author && is_fisrt_page) {
        insertLink('保存全贴', 'window.saveThread("thread")', $('#postlist > table:nth-child(1) > tbody > tr > td.plc.ptm.pbn.vwthd > div'));
    }
})();
