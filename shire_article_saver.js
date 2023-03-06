// ==UserScript==
// @name         New Userscript
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        https://www.shireyishunjian.com/main/forum.php?mod=viewthread*
// @match        https://www.shishirere.com/main/forum.php?mod=viewthread*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=shireyishunjian.com
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    const title_info = document.getElementsByClassName('ts')[0].children;
    let filename = title_info[0].textContent.replace('[', '【').replace(']', '】') + title_info[1].textContent;
    let content = document.getElementsByClassName('t_f')[0].textContent;

    const buffer = new TextEncoder().encode(content).buffer;
    const blob = new Blob([buffer], { type: 'text/plain;base64' });
    const reader = new FileReader();
    reader.readAsDataURL(blob);

    reader.onload = (event) => {
        const download_pos = document.getElementsByClassName('pi')[1].getElementsByTagName('strong')[0];
        const download_href = document.createElement('a');
        download_href.innerHTML = '下载';
        download_href.href = event.target.result;
        download_href.download = filename;
        download_pos.appendChild(download_href);
      };
})();
