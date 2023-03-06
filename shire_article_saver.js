// ==UserScript==
// @name         shire article saver
// @namespace    http://tampermonkey.net/
// @version      0.1.3
// @description  Download shire thread content.
// @author       Crash
// @match        https://www.shireyishunjian.com/main/forum.php?mod=viewthread*
// @match        https://www.shishirere.com/main/forum.php?mod=viewthread*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=shireyishunjian.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function getPostContent(post) {
        let childrenNodes = post.childNodes;
        let content = '';
        for (let i = 0; i < childrenNodes.length; i++) {
            if (childrenNodes[i].className == 'quote') {
                content += '<<<\n';
                let quote_href = childrenNodes[i].getElementsByTagName('a')[0];
                let origin_quote = quote_href.innerText;
                quote_href.innerText += ' 链接: ' + quote_href.href;
                content += childrenNodes[i].textContent + '\n';
                quote_href.innerText = origin_quote;
                content += '>>>\n';
            }
            else {
                content += childrenNodes[i].textContent;
            }
        }
        return content;
    }

    function getPostlistTitle(postlist) {
        const title_info = postlist.getElementsByClassName('ts')[0].children;
        let title_name = title_info[0].textContent.replace('[', '【').replace(']', '】') + title_info[1].textContent;
        return title_name;
    }

    function getPostInfo(post) {
        const post_id = post.id.split('_')[1];
        const post_auth = post.getElementsByClassName('authi')[0].firstElementChild.text;
        const post_auth_id = post.getElementsByClassName('authi')[0].firstElementChild.href.split('uid=')[1];
        const sub_time = post.getElementsByClassName('authi')[1].querySelector('[id^=authorposton]').textContent;
        const post_url = document.location.origin + '/main/forum.php?mod=redirect&goto=findpost&ptid=' + thread_id + '&pid=' + post_id;
        const post_content = getPostContent(post.getElementsByClassName('t_f')[0]);

        return { 'post_id': post_id, 'post_auth': post_auth, 'post_auth_id': post_auth_id, 'sub_time': sub_time, 'post_url': post_url, 'post_content': post_content };
    }

    const postlist = document.getElementById('postlist');
    const post_in_page = postlist.querySelectorAll('[class^=post_gender]');
    const thread_id = document.getElementsByClassName('plc ptm pbn vwthd')[0].lastElementChild.lastElementChild.href.split('tid=')[1];
    const first_post_floor = post_in_page[0].getElementsByClassName('pi')[1].getElementsByTagName('strong')[0];
    const is_fisrt_page = first_post_floor.textContent.includes('楼主');

    let thread_auth_name = '';
    let thread_auth_id = '';
    if (is_fisrt_page) {
        const first_post_info = getPostInfo(post_in_page[0]);
        thread_auth_name = first_post_info.post_auth;
        thread_auth_id = first_post_info.post_auth_id;
    }
    else {
        thread_auth_name = document.getElementById('tath').firstElementChild.title;
        thread_auth_id = document.getElementById('tath').firstElementChild.href.split('uid=')[1];
    }

    let title_name = getPostlistTitle(postlist);

    if (is_fisrt_page) {
        let filename = title_name;
        let content = '';

        const post_info = getPostInfo(post_in_page[0]);
        content += '//作者：' + post_info.post_auth + '(UID: ' + post_info.post_auth_id + ')\n';
        content += '//链接：' + post_info.post_url + '\n';
        content += '//时间：' + post_info.sub_time + '\n';
        content += post_info.post_content;

        const buffer = new TextEncoder().encode(content).buffer;
        const blob = new Blob([buffer], { type: 'text/plain;base64' });
        const reader = new FileReader();

        reader.readAsDataURL(blob);
        reader.onload = (event) => {
            const download_pos = first_post_floor;
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
        let content = '';
        for (let i = 0; i < post_in_page.length; i++) {
            const post_info = getPostInfo(post_in_page[i]);
            content += '<----------------\n';
            content += '//作者：' + post_info.post_auth + '(UID: ' + post_info.post_auth_id + ')\n';
            content += '//链接：' + post_info.post_url + '\n';
            content += '//时间：' + post_info.sub_time + '\n';
            content += post_info.post_content;
            content += '\n---------------->\n';
        }

        const buffer = new TextEncoder().encode(content).buffer;
        const blob = new Blob([buffer], { type: 'text/plain;base64' });
        const reader = new FileReader();

        reader.readAsDataURL(blob);
        reader.onload = (event) => {
            const download_pos = document.getElementsByClassName('plc ptm pbn vwthd')[0].children[0];
            const download_href = document.createElement('a');
            download_href.innerHTML = '保存本页';
            download_href.href = event.target.result;
            download_href.download = filename;
            download_pos.appendChild(download_href);
        };

    }


})();
