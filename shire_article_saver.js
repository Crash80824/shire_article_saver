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

(function() {
    'use strict';
    let title_info=document.getElementsByClassName('ts')[0].children
    let filename=title_info[0].textContent.replace('[','【').replace(']','】')+title_info[1].textContent
    let main_text=document.getElementsByClassName('t_f')[0].textContent

    let download_pos=document.getElementsByClassName('pi')[1].getElementsByTagName('strong')[0]
    let download_href=document.createElement('a')
    download_href.innerHTML='下载'
    download_href.href='data:text/plain;charset=utf-8,' + main_text
    download_href.download=filename
    download_pos.appendChild(download_href)
})();
