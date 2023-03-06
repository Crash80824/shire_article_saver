// ==UserScript==
// @name         shire article saver
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  download shire thread content
// @author       Crash
// @match        https://www.shireyishunjian.com/main/forum.php?mod=viewthread*
// @match        https://www.shishirere.com/main/forum.php?mod=viewthread*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=shireyishunjian.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const title_info = document.getElementsByClassName('ts')[0].children;
    const title_name = title_info[0].textContent.replace('[', '【').replace(']', '】') + title_info[1].textContent;
    const auth_uid = document.getElementsByClassName('authi')[0].getInnerHTML().match(/uid=\d*/)[0].split('=')[1];

    if (!location.href.match(/page=([2-9]|[1-9]\d+)/)) {
        let filename = title_name;
        let content = document.getElementsByClassName('t_f')[0].textContent;

        const buffer = new TextEncoder().encode(content).buffer;
        const blob = new Blob([buffer], { type: 'text/plain;base64' });
        const reader = new FileReader();

        reader.readAsDataURL(blob);
        reader.onload = (event) => {
            const download_pos = document.getElementsByClassName('pi')[1].getElementsByTagName('strong')[0];
            const download_href = document.createElement('a');
            download_href.innerHTML = '保存主楼';
            download_href.href = event.target.result;
            download_href.download = filename;
            download_pos.appendChild(download_href);
        };
    }

    if (location.href.indexOf('authorid=' + auth_uid) > 0) {
        let pageid = location.href.match(/page=\d*/)[0].split('=')[1];
        let filename = title_name + ' - ' + pageid;
        let content = '';
        for (let thread of document.getElementsByClassName('t_f')) {
            content += thread.textContent;
        }

        const buffer = new TextEncoder().encode(content).buffer;
        const blob = new Blob([buffer], { type: 'text/plain;base64' });
        const reader = new FileReader();

        reader.readAsDataURL(blob);
        reader.onload = (event) => {
            const download_pos = document.getElementsByClassName('pi')[1].getElementsByTagName('strong')[0];
            const download_href = document.createElement('a');
            download_href.innerHTML = '保存本页';
            download_href.href = event.target.result;
            download_href.download = filename;
            download_pos.appendChild(download_href);
        };

    }


})();
