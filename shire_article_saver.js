// ==UserScript==
// @name         shire article saver
// @namespace    http://tampermonkey.net/
// @version      0.1.5.1
// @description  Download shire thread content.
// @author       Crash
// @match        https://www.shireyishunjian.com/main/forum.php?mod=viewthread*
// @match        https://www.shishirere.com/main/forum.php?mod=viewthread*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=shireyishunjian.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const $ = (selector, parent = document) => parent.querySelector(selector);
    const $$ = (selector, parent = document) => parent.querySelectorAll(selector);

    function getPostContent(pid) {
        const tf = $('#postmessage_' + pid);
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

    function getPostInfo(post) {
        const post_id = post.id.split('_')[1];
        const post_auth = $('#favatar' + post_id + ' > div.pi > div > a', post).text;
        const post_auth_id = $('#favatar' + post_id + ' > div.pi > div > a', post).href.split('uid=')[1];
        const sub_time = $('[id^=authorposton]', post).textContent;
        const post_url = document.location.origin + '/main/forum.php?mod=redirect&goto=findpost&ptid=' + thread_id + '&pid=' + post_id;
        const post_content = getPostContent(post_id);

        return { 'post_id': post_id, 'post_auth': post_auth, 'post_auth_id': post_auth_id, 'sub_time': sub_time, 'post_url': post_url, 'post_content': post_content };
    }


    const postlist = $('#postlist');
    const post_in_page = $$('[class^=post_gender]', postlist);
    const thread_id = $('#postlist > table:nth-child(1) > tbody > tr > td.plc.ptm.pbn.vwthd > span > a').href.split('tid=')[1];
    const is_fisrt_page = !location.href.match(/page=([2-9]|[1-9]\d+)/);

    let thread_auth_name = '';
    let thread_auth_id = '';
    if (is_fisrt_page) {
        const first_post_info = getPostInfo(post_in_page[0]);
        thread_auth_name = first_post_info.post_auth;
        thread_auth_id = first_post_info.post_auth_id;
    }
    else {
        thread_auth_name = $('#tath > a:nth-child(1)').title;
        thread_auth_id = $('#tath > a:nth-child(1)').href.split('uid=')[1];
    }


    let title_name = $('#thread_subject').parentNode.textContent.replace('\n', '').replace('[', '【').replace(']', '】');
    let file_info = 'Link: ' + location.href + '\n****************\n';


    if (is_fisrt_page) {
        let filename = title_name;
        let content = file_info;

        const post_info = getPostInfo(post_in_page[0]);
        content += '//' + post_info.post_auth + '(UID: ' + post_info.post_auth_id + ') ' + post_info.sub_time + '\n';
        content += '//PID:' + post_info.post_id + '\n';
        content += post_info.post_content;

        const buffer = new TextEncoder().encode(content).buffer;
        const blob = new Blob([buffer], { type: 'text/plain;base64' });
        const reader = new FileReader();

        reader.readAsDataURL(blob);
        reader.onload = (event) => {
            const download_pos = $('table > tbody > tr:nth-child(1) > td.plc > div.pi > strong', post_in_page[0]);
            const download_href = document.createElement('a');
            download_href.innerHTML = '保存主楼';
            download_href.href = event.target.result;
            download_href.download = filename;
            download_pos.appendChild(download_href);
        };
    }

    if (location.href.includes('authorid=' + thread_auth_id)) {
        const pageid = location.href.match(/page=\d*/)[0].split('=')[1];
        let filename = title_name + ' - ' + pageid;
        let content = file_info;
        for (let i = 0; i < post_in_page.length; i++) {
            const post_info = getPostInfo(post_in_page[i]);
            content += '<----------------\n';
            content += '//' + post_info.post_auth + '(UID: ' + post_info.post_auth_id + ') ' + post_info.sub_time + '\n';
            content += '//PID:' + post_info.post_id + '\n';
            content += post_info.post_content;
            content += '\n---------------->\n';
        }

        const buffer = new TextEncoder().encode(content).buffer;
        const blob = new Blob([buffer], { type: 'text/plain;base64' });
        const reader = new FileReader();

        reader.readAsDataURL(blob);
        reader.onload = (event) => {
            const download_pos = $('#postlist > table:nth-child(1) > tbody > tr > td.plc.ptm.pbn.vwthd > div')
            const download_href = document.createElement('a');
            download_href.innerHTML = '保存本帖';
            download_href.href = event.target.result;
            download_href.download = filename;
            download_pos.appendChild(download_href);
        };

    }


})();
