// ==UserScript==
// @name         shire helper
// @namespace    http://tampermonkey.net/
// @version      0.7.0
// @description  Download shire thread content.
// @author       80824
// @match        https://www.shireyishunjian.com/main/*
// @match        https://www.shishirere.com/main/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=shireyishunjian.com
// @grant        unsafeWindow
// @grant        GM.getValue
// @grant        GM_getValue
// @grant        GM.setValue
// @grant        GM_setValue
// @grant        GM.deleteValue
// @grant        GM_deleteValue
// @grant        GM.listValues
// @grant        GM_listValues
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM.download
// @downloadURL https://update.greasyfork.org/scripts/461311/shire%20helper.user.js
// @updateURL https://update.greasyfork.org/scripts/461311/shire%20helper.meta.js
// @require https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js

// ==/UserScript==

(function () {
    'use strict';

    // ========================================================================================================
    // 常量和简单的工具函数
    // ========================================================================================================
    const qS = (selector, parent = document) => parent.querySelector(selector);
    const qSA = (selector, parent = document) => parent.querySelectorAll(selector);
    const docre = tag => document.createElement(tag);
    String.prototype.parseURL = function () {
        let obj = {};
        this.replace(/([^?=&#]+)=([^?=&#]+)/g, (_, key, value) => { obj[key] = value });
        this.replace(/#([^?=&#]+)/g, (_, hash) => { obj.hash = hash });
        this.replace(/(\w+)\.php/, (_, loc) => { obj.loc = loc });
        return obj;
    };

    const location_params = location.href.parseURL();
    const is_desktop = location_params.mobile == 'no' || Array.from(qSA('meta')).some(meta => meta.getAttribute('http-equiv') === 'X-UA-Compatible');

    if (!is_desktop) {
        return;
    }

    const helper_default_setting = {
        'enable_notification': true,
        'enable_history': true,
        'enable_text_download': true,
        'enable_attach_download': true,
        'enable_op_download': true,
        'files_pack_mode': 'no',
        'default_merge_mode': 'main',
        'enable_auto_reply': true,
        'enable_auto_wrap': true,
        'auto_reply_message': '收藏了，谢谢楼主分享！'
    };

    const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1 Edg/125.0.0.0';
    const large_page_num = 1024;
    const magic_num = Math.sqrt(large_page_num);
    const extensionMap = {
        'image/jpeg': 'jpg',
        'image/bmp': 'bmp',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'video/mp4': 'mp4',
        'video/x-msvideo': 'avi',
        'video/x-matroska': 'mkv',
        'video/x-flv': 'flv',
        'video/mpeg': 'mpg',
        'video/quicktime': 'mov',
        'audio/mp3': 'mp3',
        'audio/mpeg': 'mp3',
        'audio/wav': 'wav',
        'audio/wave': 'wav',
        'audio/x-wav': 'wav',
        'text/plain': 'txt'
    };

    const commonPrefix = ((str1, str2) => {
        return str1 === '' ? str2 : (str2 === '' ? str1 : (() => {
            let i = 0;
            while (i < str1.length && i < str2.length && str1[i] === str2[i]) i++;
            return str1.slice(0, i);
        })());
    });
    const startWithChinese = str => /^[\p{Script=Han}]/u.test(str);
    const extractFileAndExt = str => {
        const exts = Array.from(Object.values(extensionMap)).join('|');
        const regex = new RegExp(`([^\\/]+)\\.(${exts})$`, 'i');
        const match = str.match(regex);
        return match ? [match[1], match[2]] : [str, ''];
    };


    const checkVariableDefined = (variable_name, timeout = 15000, time_interval = 100) => new Promise((resolve, reject) => {
        const startTime = Date.now();

        function check() {
            if (typeof unsafeWindow[variable_name] !== 'undefined') {
                resolve(unsafeWindow[variable_name]);
            } else if (Date.now() - startTime >= timeout) {
                reject(new Error(`Check ${variable_name} timeout exceeded`));
            } else {
                setTimeout(check, time_interval);
            }
        }

        check();
    })

    const hasReadPermission = (doc = document) => !Boolean(qS('#messagetext', doc));
    const isFirstPage = (doc = document) => { const page = doc.URL.parseURL().page; return !Boolean(page) || page == 1; }
    const hasThreadInPage = (doc = document) => { const thread_list = qS('#delform > table > tbody > tr:not(.th)', doc); return Boolean(thread_list) && thread_list.childNodes.length > 3; }

    const getPostId = post => post.id.slice(3);
    const getPostsInPage = (page_doc = document) => qSA('[id^=pid]', page_doc);
    const getSpaceAuthor = () => {
        const space_do = location.href.parseURL().do;
        if (typeof space_do === 'undefined') {
            return qS('meta[name="keywords"]').content.slice(0, -3);
        }
        else {
            const author_name = qS('#pcd > div > div > h2 > a');
            return author_name ? author_name.textContent : '';
        }
    };

    // ========================================================================================================
    // 自定义表情
    // ========================================================================================================
    // const original_smilies_types = ['4'];
    // const new_smilies = [];
    // Element：{'name':name, 'type':type, 'path':path, 'info':[[id, smile_code, file_name, width, height, weight]]}
    // Test images: 'data/attachment/album/202207/04/192158kg0urgxtw2805yrs.png','static/image/smiley/ali/1love1.gif',''https://p.upyun.com/demo/webp/webp/animated-gif-0.webp'

    // ========================================================================================================
    // 自定义样式
    // ========================================================================================================
    GM_addStyle(`
#helper-notification-popup {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 35%;
  min-width: 300px;
  max-height: 80%;
  background-color: rgba(0, 0, 0, 0.9);
  color: white;
  padding: 20px;
  border-radius: 5px;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
  z-index: 10000;
}

.helper-noti-message {
  width: 100%;
  overflow: hidden;
  white-space: nowrap;
}

.helper-ellip-link {
  display: inline-block;
  color: #004e83 !important;
  overflow: hidden;
  max-width: calc(min(70%, 30rem));
  text-overflow: ellipsis;
  vertical-align: top;
}

#helper-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  z-index: 1000;
}

#helper-popup {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 50%;
  min-width: 600px;
  min-height: 300px;
  max-height: 85%;
  background-color: white;
  color: black !important;
  border: 1px solid #ccc;
  z-index: 2000;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

#helper-title-container {
  display: flex;
  align-items: center;
  padding: 20px;
  font-size: 1.5rem;
  font-weight: bold;
  text-align: left;
  border-bottom: 1px solid #ccc;
}

#helper-title {
  flex: 1;
}

.helper-close-btn {
  border: none;
  cursor: pointer;
  margin-left: 10px;
  border-radius: 50%;
  width: 30px;
  height: 30px;
  line-height: 30px;
  text-align: center;

  transition: background-color 0.3s;
}

.helper-close-btn {
  background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>');
}

.helper-close-btn.helper-redx {
  background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="red" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>');
}

.helper-close-btn:hover {
  background-color: #ddd;
}

.helper-hr {
  margin: 0;
  border: 0;
  border-top: 1px solid #ccc;
}

#helper-content-container {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.helper-scroll-component {
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #888 #eee;
}

#helper-tab-btn-container {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.helper-tab-btn {
  padding: 10px;
  border: none;
  background-color: transparent;
  color: inherit;
  cursor: pointer;
  text-align: center;
  font-size: 0.75rem;
  font-weight: 500;
  margin: 5px;
  border-radius: 12px;
  transition: background-color 0.3s;
  white-space: nowrap;
}

.helper-tab-selected {
  background-color: #ddd;
}

#helper-tab-content-container {
  flex: 1;
  padding: 10px;
  font-size: 0.75rem;
}

.helper-active-component {
  height: 32px;
  border-radius: 32px;
}

.helper-halfheight-active-component {
  height: 16px;
  border-radius: 16px;
}

.helper-setting-container {
  display: flex;
  min-height: 36px;
  justify-content: space-between;
  align-items: center;
  padding: 5px;
}

div:has(.helper-setting-container)
  .helper-setting-container:not(:last-of-type) {
  border-bottom: 1px solid #ccc;
}

label:has(.helper-toggle-switch) > input {
  display: none;
}

.helper-toggle-switch {
  position: relative;
  display: inline-block;
  width: 32px;
  background-color: #ddd;
  transition: background-color 0.3s;
}

.helper-toggle-switch::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  background-color: white;
  border-radius: 50%;
  transition: transform 0.3s;
}

label:has(.helper-toggle-switch) > input:checked + .helper-toggle-switch {
  background-color: #4caf50;
}

label:has(.helper-toggle-switch)
  > input:checked
  + .helper-toggle-switch::after {
  transform: translateX(15px);
}

.helper-select {
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="black" class="bi bi-chevron-down" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/></svg>')
    no-repeat right 10px center;
  background-color: inherit;
  color: inherit;
  border: 1px solid #ccc;
  padding: 0 10px;
  width: 6rem;
  transition: background-color 0.3s, border-color 0.3s;
  cursor: pointer;
  outline: none;
}

.helper-select:focus {
  background-color: #ddd;
  border-color: #ccc;
}

.helper-multicheck-container {
  display: flex;
  border: 1px solid #ccc;
  box-sizing: border-box;
  overflow: hidden;
}

.helper-multicheck-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.3s;
  position: relative;
}

.helper-multicheck-item:not(:first-child)::before {
  content: "";
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 1px;
  background-color: #eee;
}

.helper-multicheck-item:not(:first-child) {
  padding-left: 1px;
}

.helper-multicheck-item:not(:last-child)::before {
  display: block;
}

.helper-multicheck-item input[type="checkbox"] {
  position: absolute;
  opacity: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  cursor: pointer;
}

.helper-multicheck-item
  input[type="checkbox"]:checked
  + .helper-multicheck-text {
  background-color: #4caf50;
}

.helper-multicheck-item .helper-multicheck-text {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 0 10px;
  background-color: inherit;
  border: 1px solid transparent;
  transition: background-color 0.3s;
  box-sizing: border-box;
  white-space: nowrap;
}

.helper-setting-button {
  padding: 0 20px;
  background-color: inherit;
  color: inherit;
  border: 1px solid #ccc;
  cursor: pointer;
  transition: background-color 0.3s;
}

.helper-follow-button,
.helper-followed-button {
  padding: 2px;
  width: 5.5rem;
  cursor: pointer;
  border: none;
  border-radius: 8px;
  color: white;
  transition: background-color 0.3s ease;
}

.helper-follow-button {
  background-color: #1772f6;
}

.helper-follow-button:hover {
  background-color: #0063e6;
}

.helper-followed-button {
  background-color: #8491a5;
}

.helper-followed-button:hover {
  background-color: #758195;
}

.helper-checkbox {
  appearance: none;
  width: 10px;
  height: 10px;
  border: 1px solid black;
  background-color: transparent;
  display: inline-block;
  position: relative;
  margin-right: 5px;
  cursor: pointer;
}

.helper-checkbox:before {
  content: "";
  background-color: black;
  display: block;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) scale(0);
  width: 5px;
  height: 5px;
  transition: all 0.1s ease-in-out;
}

.helper-checkbox:checked:before {
  transform: translate(-50%, -50%) scale(1);
}

.helper-checkbox-label {
  color: black;
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
}

.helper-follow-table {
  width: 100%;
  border-collapse: collapse;
}

.helper-scroll-component:has(.helper-follow-table) {
  padding-top: 0 !important;
}

.helper-follow-table th,
.helper-follow-table td {
  padding: 8px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 10rem;
}

.helper-follow-table thead tr th {
  position: sticky;
  top: 0px;
  padding-top: 10px;
  background-color: white;
}
    `);


    // ========================================================================================================
    // 更新GM Value的函数
    // ========================================================================================================
    function updateGMListElements(list, elem, status, equal = (a, b) => a == b) {
        // 根据equal判断独立elem，根据status判断新list中是否有elem
        if (status && !list.some(e => equal(e, elem))) { // 存入元素
            list.push(elem);
        }
        if (list.some(e => equal(e, elem))) {
            const new_list = list.filter(e => !equal(e, elem)); // 删除元素
            list.length = 0;
            list.push(...new_list);
            if (status) {
                list.push(elem); // 更新元素
            }
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
    function recordCheckbox(value, id, checked) {
        let checked_list = GM_getValue(value, []);
        id = id.split('_check_')[1];
        updateGMListElements(checked_list, id, checked);
        updateGMList(value, checked_list);
    }

    function changePageAllCheckboxs() {
        const tid = location.href.parseURL().tid;
        const checkbox_page = qS('#page_checked_all');
        const checked_for_all = checkbox_page.checked;
        const checkbox_posts = qSA('input[id^="post_check_"]');
        let checked_list = GM_getValue(`${tid}_checked_posts`, []);
        for (let checkbox of checkbox_posts) {
            checkbox.checked = checked_for_all;
            const id = checkbox.id.split('_check_')[1];
            updateGMListElements(checked_list, id, checked_for_all);
        }
        updateGMList(`${tid}_checked_posts`, checked_list);
    }

    // 关注某个用户在某个Thread下的回复
    // 若tid==0，则关注用户的所有主题
    // 若tid==-1, 则关注用户的所有回复
    function recordFollow(info, followed) {
        let followed_threads = GM_getValue(info.uid + '_followed_threads', []);
        updateGMListElements(followed_threads, { "tid": info.tid, 'title': info.title, "last_tpid": 0 }, followed, (a, b) => a.tid == b.tid); // last_tpid==0 表示这是新关注的用户
        updateGMList(info.uid + '_followed_threads', followed_threads);

        let followed_users = GM_getValue('followed_users', []);
        updateGMListElements(followed_users, { 'uid': info.uid, 'name': info.name }, followed_threads.length > 0, (a, b) => a.uid == b.uid);
        updateGMList('followed_users', followed_users);

        let followed_num = GM_getValue('followed_num', 0);
        followed_num += followed ? 1 : -1;
        followed_num = followed_num < 0 ? 0 : followed_num;
        GM.setValue('followed_num', followed_num);
    }

    // ========================================================================================================
    // 获取页面或帖子非正文内容的函数
    // ========================================================================================================
    function getPostInfo(post, page_doc = document) {
        const post_id = getPostId(post);
        const thread_id = qS('#postlist > table:nth-child(1) > tbody > tr > td.plc.ptm.pbn.vwthd > span > a', page_doc).href.parseURL().tid;
        const post_auth = qS('#favatar' + post_id + ' > div.pi > div > a', post).text;
        const post_auth_id = qS('#favatar' + post_id + ' > div.pi > div > a', post).href.parseURL().uid;
        const sub_time = qS('[id^=authorposton]', post).textContent;
        const post_URL = `${page_doc.baseURI}forum.php?mod=redirect&goto=findpost&ptid=${thread_id}&pid=${post_id}`;

        return { 'post_id': post_id, 'post_auth': post_auth, 'post_auth_id': post_auth_id, 'sub_time': sub_time, 'post_URL': post_URL };
    }

    function getThreadAuthorInfo() {
        let thread_auth_name = '';
        let thread_auth_id = '';
        if (isFirstPage()) {
            const first_post_info = getPostInfo(qS('#postlist > div > table'));
            thread_auth_name = first_post_info.post_auth;
            thread_auth_id = first_post_info.post_auth_id;
        }
        else {
            thread_auth_name = qS('#tath > a:nth-child(1)').title;
            thread_auth_id = qS('#tath > a:nth-child(1)').href.parseURL().uid;
        }
        return { 'name': thread_auth_name, 'id': thread_auth_id };
    }

    function createURLInDomain(params) {
        if (!'loc' in params) {
            return;
        }
        let url = `https://${location.host}/main/${params.loc}.php?`;
        delete params.loc;
        for (const [key, value] of Object.entries(params)) {
            url += `${key}=${value}&`;
        }
        return url;
    }

    async function getPageDocInDomain(params, UA = null) {
        const url = createURLInDomain(params);
        if (UA === null) {
            const response = await fetch(url);
            let page_doc = new DOMParser().parseFromString(await response.text(), 'text/html');
            page_doc.original_url = url;
            return page_doc;
        }
        else {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    headers: { 'User-Agent': UA },
                    onload: response => {
                        let page_doc = new DOMParser().parseFromString(response.responseText, 'text/html');
                        page_doc.original_url = url;
                        resolve(page_doc);
                    }
                });
            });
        }
    }

    // ========================================================================================================
    // 获取帖子和楼层内容的函数
    // ========================================================================================================
    function getPostChildNodeText(child) {
        let text = '';
        switch (child.tagName + '.' + child.className) {
            case 'STYLE.':
            case 'SCRIPT.':
            case 'TABLE.op':
            case 'IGNORE_JS_OP.':
                break;
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
        return text;
    }

    function getPostContent(pid, page_doc = document) {
        const post = qS('#post_' + pid, page_doc);

        const tf = qS('#postmessage_' + pid, post);
        let children_nodes = tf.childNodes;
        let text = '';
        for (let child of children_nodes) {
            text += getPostChildNodeText(child);
        }

        let image_list = qS('#imagelist_' + pid, post); // 多图
        if (!image_list) {
            image_list = qS('.pattl', post); // 单图
        }
        let attachments = [];
        if (image_list) {
            image_list = qSA('img', image_list);
            for (let i = 0; i < image_list.length; i++) {
                const img = image_list[i];
                const img_url = img.getAttribute('zoomfile');
                let img_title = img.title
                if (!startWithChinese(img_title)) {
                    img_title = '';
                }
                attachments.push({ 'url': img_url, 'title': img_title });

            }
        }

        let op_body = qS('[id^="op-"][id$="-body"]', post);
        let ops = [];
        if (op_body) {
            const url_list = qSA('a', op_body);
            if (url_list.length > 0) {
                for (let url of url_list) {
                    ops.push({ 'url': url.href, 'title': url.textContent });
                }
            }
        }

        return { 'text': text, 'attach': attachments, 'op': ops };
    }

    async function getPageContent(page_doc, type = 'main') {
        if (!page_doc.original_url) {
            page_doc.original_url = page_doc.URL;
        }

        const tid = page_doc.original_url.parseURL().tid;
        let page_id = page_doc.original_url.parseURL().page;
        if (!page_id) {
            page_id = 1;
        }
        const checked_posts = await GM.getValue(tid + '_checked_posts', []);
        const posts_in_page = getPostsInPage(page_doc);

        let text = '';
        let attach = [];
        let op = [];
        for (let post of posts_in_page) {
            if (type == 'checked') {
                const post_id = getPostId(post);
                if (!checked_posts.includes(post_id)) {
                    continue;
                }
            }
            const post_info = getPostInfo(post, page_doc);
            const post_content = getPostContent(post_info.post_id, page_doc);

            attach.push(...post_content.attach);
            op.push(...post_content.op);

            if (type != 'main') {
                text += '<----------------\n';
            }
            text += `//${post_info.post_auth}(UID: ${post_info.post_auth_id}) ${post_info.sub_time}\n`;
            text += `//PID:${post_info.post_id}\n`;
            text += post_content.text;
            if (type != 'main') {
                text += '\n---------------->\n';
            }

            if (type == 'main') {
                break;
            }
        }
        return { 'tid': tid, 'page_id': page_id, 'text': text, 'attach': attach, 'op': op };
    }

    // ========================================================================================================
    // 保存与下载的函数
    // ========================================================================================================
    function downloadFromURL(target, zip = null) {
        const url = target.url;
        let title = target.title;
        const is_blob = Boolean(target.is_blob);

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url,
                responseType: 'blob',
                onload: response => {
                    const content_type = response.responseHeaders.match(/Content-Type: (.+)/i);
                    let ext = 'unknown';
                    if (content_type && content_type[1]) {
                        ext = extensionMap[content_type[1]] || 'unknown';
                    }

                    if (ext == 'unknown') {
                        [title, ext] = extractFileAndExt(title);
                    }

                    if (ext != 'unknown') {
                        const blob = response.response;
                        if (zip !== null && response.status == 200) {
                            zip.file(`${title}.${ext}`, blob);
                            resolve();
                        }
                        else {
                            const reader = new FileReader();
                            reader.readAsDataURL(blob);
                            reader.onload = () => {
                                const a = docre('a');
                                a.download = `${title}.${ext}`;
                                a.href = reader.result;
                                a.click();
                            }
                            const revokeURL = () => is_blob ? URL.revokeObjectURL(url) : null;
                            reader.onloadend = revokeURL;
                            resolve();
                        }
                    }
                }
            });
        });
    }

    function createZipAndDownloadFromURLs(zip_name, target_list) {
        if (target_list.length == 0) {
            return;
        }

        if (target_list.length == 1) {
            downloadFromURL(target_list[0]);
            return;
        }

        const zip = new JSZip();
        const promises = target_list.map(target => downloadFromURL(target, zip));
        Promise.all(promises).then(() => {
            zip.generateAsync({ type: 'blob' }).then(content => {
                const a = docre('a');
                a.download = zip_name + '.zip';
                a.href = URL.createObjectURL(content);
                a.click();
                URL.revokeObjectURL(a.href);
            });
        });
    }

    async function saveFile(filename, text, attach = [], op = []) {
        const something_to_save = helper_setting.enable_text_download || (helper_setting.enable_attach_download && attach.length > 0) || (helper_setting.enable_op_download && op.length > 0);
        if (!something_to_save) {
            alert('没有需要保存的内容, 请检查设置.');
            return;
        }

        let download_list = []

        if (helper_setting.enable_text_download) {
            const blob = new Blob([text], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            download_list.push({ 'list': [{ 'url': url, 'title': filename, 'is_blob': true }], 'name': '正文' });
        }

        if (helper_setting.enable_attach_download) {
            attach.forEach((e, i) => {
                e.url = location.origin + '/main/' + e.url;
                e.title = e.title || `${i + 1}`;
                e.title = `${filename}_附${e.title}`;
            });
            download_list.push({ 'list': attach, 'name': '附件' });
        }

        if (helper_setting.enable_op_download) {
            download_list.push({ 'list': op, 'name': '原创资源保护' });
        }

        switch (helper_setting.files_pack_mode) {
            case 'no':
                download_list.forEach(target => target.list.forEach(e => downloadFromURL(e)));
                break;
            case 'single':
                download_list.forEach(target => createZipAndDownloadFromURLs(`${filename}_${target.name}`, target.list));
                break;
            case 'all':
                createZipAndDownloadFromURLs(filename, download_list.flatMap(e => e.list));
                break;
        }
    }

    async function saveThread(type = 'main') {
        const thread_id = qS('#postlist > table:nth-child(1) > tbody > tr > td.plc.ptm.pbn.vwthd > span > a').href.parseURL().tid;
        let title_name = qS('#thread_subject').parentNode.textContent.replaceAll('\n', '').replaceAll('[', '【').replaceAll(']', '】');
        let file_info = `Link: ${location.href}\n****************\n`;

        if (type == 'main') {
            let text = file_info;
            let content = await getPageContent(document, 'main');
            text += content.text;
            saveFile(title_name, text, content.attach, content.op);
        }
        else {
            let filename = title_name;
            let text = file_info;
            let attach = [];
            let op = [];
            const page_author = getThreadAuthorInfo();
            const specific_authorid = location.href.parseURL().authorid;
            const is_only_author = specific_authorid == page_author.id;

            let filename_suffix = '';
            if (is_only_author) {
                filename_suffix = `${page_author.name}`;
                if (type == 'checked') {
                    filename_suffix += '节选';
                }
            }
            else {
                if (type == 'page') {
                    filename_suffix = '全帖';
                }
                else if (type == 'checked') {
                    filename_suffix = '节选';
                }
            }
            filename += '（' + filename_suffix + '）';

            const page_num = (qS('#pgt > div > div > label > span') || { 'title': '共 1 页' }).title.match(/共 (\d+) 页/)[1];
            const promises = Array.from({ length: page_num }, (_, i) => i + 1).map(async page_id => {
                const URL_params = { 'loc': 'forum', 'mod': 'viewthread', 'tid': thread_id, 'page': page_id };
                if (is_only_author) {
                    URL_params.authorid = specific_authorid;
                }
                const page_doc = await getPageDocInDomain(URL_params);
                return getPageContent(page_doc, type);
            });
            let content_list = await Promise.all(promises);
            content_list.sort((a, b) => a.page_id - b.page_id);
            text += content_list.map(e => e.text).join('');
            attach.push(...content_list.map(e => e.attach).flat());
            op.push(...content_list.map(e => e.op).flat());
            saveFile(filename, text, attach, op);
            if (type == 'checked') {
                GM.deleteValue(thread_id + '_checked_posts');
            }
        }
    }

    async function saveMergedThreads() {
        const uid = location.href.parseURL().uid;
        let checked_threads = GM_getValue(uid + '_checked_threads', []);

        let filename = '';
        const promises = checked_threads.map(async tid => {
            const URL_params = { 'loc': 'forum', 'mod': 'viewthread', 'tid': tid };
            const thread_doc = await getPageDocInDomain(URL_params);
            const thread_title = qS('head > title', thread_doc).textContent.slice(0, -8);
            filename = commonPrefix(filename, thread_title);
            let thread_content = '';
            if (hasReadPermission(thread_doc)) {
                thread_content = (getPageContent(thread_doc, 'main'));
            }
            else {
                thread_content = { 'tid': tid, 'text': '没有权限查看此贴\n' };
            }
            return new Promise(resolve => resolve(thread_content));
        });
        let content_list = await Promise.all(promises);
        content_list = content_list.sort((a, b) => a.tid - b.tid);
        const content = content_list.map(e => e.text).join('\n');
        filename = filename.replace(/[ \t\r\n(（【［“‘]/g, '')
        filename += '（合集）';
        saveFile(filename, content);
        GM.deleteValue(uid + '_checked_threads');
    }

    function autoReply() {
        const reply_text = helper_setting.auto_reply_message;
        const reply_textarea = qS('#fastpostmessage');
        if (reply_textarea) {
            reply_textarea.value = reply_text;
        }
        const reply_btn = qS('#fastpostsubmit');
        if (reply_btn) {
            reply_btn.click();
        }
    }

    // ========================================================================================================
    // 获取关注用户最新动态的函数
    // ========================================================================================================
    async function getUserNewestPostOrThread(uid, tid, last_tpid = 0) {
        // 返回结构：
        // { 'new': [{ 'tid': tid, 'title': title, 'pids': [] }], 'found': found, 'last_tpid': last_tpid }
        // 其中对于对于tid=0的情况，pids为undefined
        if (tid == 0) {
            return getUserNewestThread(uid, last_tpid);
        }
        else if (tid > 0) {
            return getUserNewestPostInThread(uid, tid, last_tpid);
        }
        else if (tid == -1) {
            return getUserNewestReply(uid, last_tpid);
        }
    }

    async function getUserNewestReply(uid, last_pid = 0) {
        // 返回用户空间回复页首页新于last_pid的回复，通过能否在首页查询到不晚于last_pid的回复判断是否可能有更多回复

        const URL_params = { 'loc': 'home', 'mod': 'space', 'uid': uid, 'do': 'thread', 'view': 'me', 'type': 'reply', 'from': 'space', 'mobile': 2 };
        const followed_threads = GM_getValue(uid + '_followed_threads', []);
        const follow_tids = followed_threads.map(e => e.tid).filter(e => e > 0);
        const page_doc = await getPageDocInDomain(URL_params, mobileUA);
        const threads_in_page = qSA('#home > div.threadlist.cl > ul > li', page_doc);
        let new_replyed_threads = [];
        let found = false;
        if (threads_in_page.length > 0) {
            for (let thread of threads_in_page) {
                const reply_in_thread = qSA('a', thread);
                const tid = reply_in_thread[0].href.parseURL().ptid;
                const title = qS('em', reply_in_thread[0]).textContent.trim()
                let pids = []
                for (let i = 1; i < reply_in_thread.length; i++) { // index 0 是主题链接
                    const pid = reply_in_thread[i].href.parseURL().pid;
                    if (pid <= last_pid) {
                        found = true;
                        break;
                    }
                    pids.push(pid);
                }
                if (pids.length > 0 && !follow_tids.includes(Number(tid))) {
                    new_replyed_threads.push({ 'tid': tid, 'title': title, 'pids': pids });
                }
            }
        }
        last_pid = new_replyed_threads.length == 0 ? 1 : new_replyed_threads[0].pids[0]; // last_pid==0代表第一次查询新回复状态，所以完全没有回复的状态只能设为1
        return { 'new': new_replyed_threads, 'found': found, 'last_tpid': last_pid };
    }

    async function getUserNewestThread(uid, last_tid = 0) {
        // 返回用户空间主题页首页新于last_tid的主题，通过能否在首页查询到不晚于last_tid的主题判断是否可能有更多主题

        const URL_params = { 'loc': 'home', 'mod': 'space', 'uid': uid, 'do': 'thread', 'view': 'me', 'from': 'space', 'mobile': 2 };
        const page_doc = await getPageDocInDomain(URL_params, mobileUA);
        const threads_in_page = qSA('li.list', page_doc);
        let new_threads = [];
        let found = false;
        if (threads_in_page.length > 0) {
            for (let thread of threads_in_page) {
                const tid = qS('a:nth-child(2)', thread).href.parseURL().tid;
                if (tid <= last_tid) {
                    found = true;
                    break;
                }
                const title = qS('a:nth-child(2) > div > em', thread).textContent;
                new_threads.push({ 'tid': tid, 'title': title });
                if (last_tid == 0) {
                    break;
                }
            }
        }
        last_tid = new_threads.length == 0 ? 1 : new_threads[0].tid;
        return { 'new': new_threads, 'found': found, 'last_tpid': last_tid }
    }

    async function getUserNewestPostInThread(uid, tid, last_pid = 0) {
        // 返回关注主题只看该作者末页（large_page_num）新于last_pid的回复，通过能否在末页查询到不晚于last_pid的回复判断是否可能有更多回复

        const URL_params = { 'loc': 'forum', 'mod': 'viewthread', 'tid': tid, 'authorid': uid, 'page': large_page_num, 'mobile': 2 };
        const page_doc = await getPageDocInDomain(URL_params, mobileUA);
        const posts_in_page = getPostsInPage(page_doc);
        const thread_title = qS('head > title', page_doc).textContent.slice(0, -8);
        let new_posts = [];
        let found = false;
        let pids = [];
        for (let i = posts_in_page.length - 1; i >= 0; i--) {
            const post = posts_in_page[i];
            const pid = getPostId(post);
            if (pid <= last_pid) {
                found = true;
                break;
            }
            pids.push(pid);
            if (last_pid == 0) {
                break;
            }
        }
        if (pids.length > 0) {
            new_posts.push({ 'tid': tid, 'title': thread_title, 'pids': pids });
        }
        last_pid = new_posts.length == 0 ? 1 : new_posts[0].pids[0]; // last_pid==0代表第一次查询新回复状态，所以完全没有回复的状态只能设为1
        return { 'new': new_posts, 'found': found, 'last_tpid': last_pid };
    }

    // ========================================================================================================
    // 修改页面内容的函数
    // ========================================================================================================
    function insertHelperLink() {
        let target_menu = qS('#myitem')
        if (target_menu) {
            const helper_setting_link = insertInteractiveLink('助手', () => { if (!qS('#helper-popup')) { createHelperPopup() } }, target_menu, 'insertBefore');
            helper_setting_link.id = 'helper_setting';
            const span = docre('span');
            span.textContent = ' | ';
            span.className = 'pipe';
            insertElement(span, target_menu);
            return;
        }

        target_menu = qS('#myspace');
        if (target_menu) {
            target_menu = qS('#myspace')
            insertInteractiveLink('助手', () => { if (!qS('#helper-popup')) { createHelperPopup() } }, target_menu, 'insertBefore');
            return;
        }
    }
    function insertElement(elem, pos, type = 'insertBefore') {
        switch (type) {
            case 'append':
                pos.appendChild(elem);
                break;
            case 'insertBefore':
                pos.parentNode.insertBefore(elem, pos);
                break;
            case 'insertAfter':
                if (pos.nextSibling) {
                    pos.parentNode.insertBefore(elem, pos.nextSibling);
                }
                else {
                    pos.parentNode.appendChild(elem);
                }
                break;
        }
    }

    function insertInteractiveLink(text, func, pos, type = 'append') {
        const a = docre('a');
        a.href = 'javascript:void(0)';
        a.textContent = text;
        if (func instanceof Function) {
            a.addEventListener('click', func);
        }
        insertElement(a, pos, type);
        return a;
    }

    function insertLink(text, URL_params, pos, max_text_length = 0, type = 'append') {
        const a = docre('a');
        if (max_text_length > 0 && text.length > max_text_length) {
            a.text = text.slice(0, max_text_length) + '...';
            a.title = text;
        }
        else {
            a.textContent = text;
        }
        a.href = createURLInDomain(URL_params);
        a.target = '_blank';
        insertElement(a, pos, type);
        return a;
    }

    function createFollowButton(info) {
        // info: { 'uid': uid, 'name': name, 'tid': tid, 'title': title }
        let follow_text;
        let followed_text;
        let unfollow_text;
        switch (info.tid) {
            case -1: {
                follow_text = '特别关注';
                followed_text = '已特关';
                unfollow_text = '取消特关';
                info.title = '所有回复';
                break;
            }
            case 0: {
                follow_text = '关注';
                followed_text = '已关注';
                unfollow_text = '取消关注';
                info.title = '所有主题';
                break;
            }
            default: {
                follow_text = '在本帖关注';
                followed_text = '已在本帖关注';
                unfollow_text = '在本帖取关';
            }
        }

        const follow_btn = docre('button');
        const follow_status = GM_getValue(info.uid + '_followed_threads', []);
        const followed = follow_status.some(e => e.tid == info.tid);
        follow_btn.type = 'button';
        follow_btn.className = followed ? 'helper-followed-button' : 'helper-follow-button';
        follow_btn.textContent = followed ? followed_text : follow_text;

        follow_btn.addEventListener('click', async () => {
            const followed_num = GM_getValue('followed_num', 0);
            if (followed_num >= magic_num) {
                alert('关注数已达上限，请清理关注列表.');
                return;
            }
            const follow_status = GM_getValue(info.uid + '_followed_threads', []);
            const followed = follow_status.some(e => e.tid == info.tid);
            follow_btn.classList.remove(followed ? 'helper-followed-button' : 'helper-follow-button');
            follow_btn.classList.add(!followed ? 'helper-followed-button' : 'helper-follow-button');
            follow_btn.textContent = !followed ? followed_text : follow_text;
            recordFollow(info, !followed);
            if (info.tid == -1 && !followed) { // 特关同时也关注主题
                recordFollow({ 'uid': info.uid, 'name': info.name, 'tid': 0, 'title': '所有主题' }, true);
            }
        });

        follow_btn.addEventListener('mouseover', () => {
            if (follow_btn.className == 'helper-followed-button') {
                follow_btn.textContent = unfollow_text;
            }
        });
        follow_btn.addEventListener('mouseout', () => {
            if (follow_btn.className == 'helper-followed-button') {
                follow_btn.textContent = followed_text;
            }
        });

        return follow_btn;
    }

    function addWrapInNode(root, min_para_length, para_length, max_para_length, dot_char, comma_char) {
        const find_break = text => {
            for (let i = para_length; i < Math.min(text.length, max_para_length); i++) {
                if (dot_char.includes(text[i])) {
                    return i;
                }
            }
            if (text.length > max_para_length) {
                for (let i = max_para_length; i < text.length; i++) {
                    if (comma_char.includes(text[i])) {
                        return i;
                    }
                }
            }
            return -1;
        };

        let iter = document.createNodeIterator(root, NodeFilter.SHOW_TEXT, null, false);
        let node = iter.nextNode();
        while (node) {
            let text = node.nodeValue;

            let break_index;
            if (text.length > para_length) {
                break_index = find_break(text);
            }

            if (break_index > 0) {
                let text1 = text.slice(0, break_index + 1);
                let text2 = text.slice(break_index + 1);
                if (text2.trim().length > min_para_length) {
                    node.nodeValue = "";
                    let new_node1 = document.createTextNode(text1);
                    let br = docre('br');
                    br.setAttribute('data-hbr', 'auto-wrap');
                    let new_node2 = document.createTextNode(text2);
                    insertElement(new_node2, node, 'insertAfter');
                    insertElement(br, new_node2);
                    insertElement(new_node1, br);
                    let current_node = node;

                    node = iter.nextNode();
                    node = iter.nextNode();
                    node.parentNode.removeChild(current_node);
                    continue;
                }
            }
            node = iter.nextNode();
        }

        iter = document.createNodeIterator(root, NodeFilter.SHOW_ELEMENT, { acceptNode: node => node.tagName == 'BR' }, false);
        node = iter.nextNode();
        while (node) {
            let previous_in_multi_br = false;
            let last_in_multi_br = false;
            while (node) {
                if (node.nextSibling) {
                    const next = node.nextSibling;
                    const next_is_br = next.tagName == 'BR';
                    const next_is_space = next.nodeType == Node.TEXT_NODE && next.nodeValue.trim() == "";
                    const nnext_is_br = next.nextSibling && next.nextSibling.tagName == 'BR';
                    const nnext_is_newline = next.nextSibling && next.nextSibling.nodeType == Node.TEXT_NODE && next.nextSibling.nodeValue.trim() != "";
                    previous_in_multi_br = next_is_br || next_is_space && (nnext_is_br || nnext_is_newline);
                    if (previous_in_multi_br) {
                        node = iter.nextNode();
                        last_in_multi_br = true;
                        continue;
                    }
                }
                break;
            }
            if (!previous_in_multi_br && !last_in_multi_br) {
                const br = docre('br');
                br.setAttribute('data-hbr', 'before-single-br');
                insertElement(br, node);
            }
            node = iter.nextNode();
        }
    }

    async function modifyPostInPage() {
        const tid = location.href.parseURL().tid;
        const checked_posts = await GM.getValue(tid + '_checked_posts', []);
        const posts_in_page = getPostsInPage();
        const thread_title = qS('#thread_subject').textContent;
        let all_checked = true;

        for (let post of posts_in_page) {
            const post_info = getPostInfo(post);
            const pid = post_info.post_id;
            const uid = post_info.post_auth_id;

            const label = docre('label');
            const checkbox = docre('input');
            checkbox.id = 'post_check_' + pid;
            checkbox.className = 'helper-checkbox';
            checkbox.type = 'checkbox';
            checkbox.checked = checked_posts.includes(pid);
            checkbox.addEventListener('change', () => { recordCheckbox(`${tid}_checked_posts`, checkbox.id, checkbox.checked) });// 每个Thread设置一个数组，存入被选中的Post的ID
            label.appendChild(checkbox);

            const label_text = document.createTextNode('保存本层');
            label.className = 'helper-checkbox-label o';
            label.appendChild(label_text);

            all_checked = all_checked && checkbox.checked;

            const user_card = qS('tbody > tr:nth-child(1) > td.pls > div', post)
            const post_follow_btn = createFollowButton({ 'uid': uid, 'name': post_info.post_auth, 'tid': tid, 'title': thread_title });
            post_follow_btn.classList.add('o');
            user_card.appendChild(post_follow_btn);
            user_card.appendChild(label);

            const profile_icon = qS('[id^=userinfo] > div.i.y > div.imicn', post)
            profile_icon.appendChild(createFollowButton({ 'uid': uid, 'name': post_info.post_auth, 'tid': 0 }));

            if (helper_setting.enable_auto_wrap) {
                const post_content = qS('[id^=postmessage]', post);
                addWrapInNode(post_content, 100, 200, 300, ['.', '。', '？', '?', '!', '！'], [',', '，', '、', ';', '；']);
            }
        }

        const label = docre('label');
        const label_text = document.createTextNode(all_checked ? '清空全选' : '全选本页');
        label.appendChild(label_text);
        qS('#postlist > table:nth-child(1) > tbody > tr > td.plc.ptm.pbn.vwthd > div').appendChild(label);

        const checkbox = docre('input');
        checkbox.id = 'page_checked_all';
        checkbox.type = 'checkbox';
        checkbox.className = 'helper-checkbox';
        checkbox.style.verticalAlign = 'middle';
        checkbox.checked = all_checked;
        checkbox.addEventListener('change', () => { changePageAllCheckboxs() });
        label.appendChild(checkbox);
    }

    async function insertSpaceCheckbox() {
        const uid = location.href.parseURL().uid;
        const checked_threads = await GM.getValue(uid + '_checked_threads', []);
        const thread_in_page = qSA('tr:not(.th)', qS('#delform > table > tbody'));

        for (let thread of thread_in_page) {
            const link = qS('th > a', thread)
            const tid = link.href.parseURL().tid;
            const checkbox = docre('input');
            checkbox.id = 'thread_check_' + tid;
            checkbox.type = 'checkbox';
            checkbox.className = 'pc';
            checkbox.checked = checked_threads.includes(tid);

            insertElement(checkbox, link);

            if (qS('td:nth-child(3) > a', thread).textContent == '保密存档') {
                checkbox.disabled = true;
                continue;
            }

            checkbox.addEventListener('change', () => { recordCheckbox(`${uid}_checked_threads`, checkbox.id, checkbox.checked) });// 每个用户设置一个数组，存入被选中的thread的ID
        }
    }

    async function modifyPostPage() {
        const author = getThreadAuthorInfo();
        const is_only_author = location.href.parseURL().authorid == author.id;

        modifyPostInPage();

        const saveFunc = (type = 'main') => async () => {
            saveThread(type);
            // if (helper_setting.auto_reply) {
            //     autoReply();
            // }
        };

        if (isFirstPage()) {
            insertInteractiveLink('保存主楼  ', saveFunc(), qS('#postlist > div > table > tbody > tr:nth-child(1) > td.plc > div.pi > strong'));

            if (is_only_author) {
                insertInteractiveLink('保存作者  ', saveFunc("page"), qS('#postlist > table:nth-child(1) > tbody > tr > td.plc.ptm.pbn.vwthd > div'));
            }
            else {
                insertInteractiveLink('保存全帖  ', saveFunc("page"), qS('#postlist > table:nth-child(1) > tbody > tr > td.plc.ptm.pbn.vwthd > div'));
            }
        }

        insertInteractiveLink('保存选中  ', saveFunc("checked"), qS('#postlist > table:nth-child(1) > tbody > tr > td.plc.ptm.pbn.vwthd > div'));
    }

    async function modifySpacePage() {
        let URL_info = location.href.parseURL();
        if (!Boolean(URL_info.type)) {
            URL_info.type = 'thread'
        }
        if (URL_info.do == 'thread' && URL_info.type == 'thread') {
            if (hasThreadInPage()) {
                insertSpaceCheckbox();
            }

            const pos = qS('#delform > table > tbody > tr.th > th');
            insertInteractiveLink('  合并保存', () => saveMergedThreads(), pos);
        }

        const toptb = qS('#toptb > div.z');
        if (toptb) {
            const name = getSpaceAuthor();
            const URL_params = { 'loc': 'home', 'mod': 'space', 'uid': URL_info.uid, 'do': 'thread', 'view': 'me', 'from': 'space' };
            insertLink(`${name}的主题`, URL_params, toptb);
            toptb.appendChild(createFollowButton({ 'uid': URL_info.uid, 'name': name, 'tid': URL_info.type == 'reply' ? -1 : 0 }));
        }

        if (URL_info.mod == 'space' && URL_info.uid == GM_info.script.author && URL_info.do == 'wall' && URL_info.loc == 'home') {
            const pos = qS('#pcd > div > ul');
            const label = docre('label');
            const checkbox = docre('input');
            checkbox.type = 'checkbox';
            checkbox.checked = helper_setting.enable_debug_mode;
            checkbox.addEventListener('change', () => { helper_setting.enable_debug_mode = checkbox.checked; GM.setValue('helper_setting', helper_setting); });
            const text = document.createTextNode('调试模式');
            label.appendChild(checkbox);
            label.appendChild(text);
            pos.appendChild(label);
        }

    }

    // ========================================================================================================
    // 浮动弹窗相关
    // ========================================================================================================
    window.addEventListener('keydown', e => {
        if (e.key == 'Escape') {
            const noti_popup = qS('#helper-notification-popup');
            if (noti_popup && noti_popup.style.display != 'none') {
                noti_popup.style.display = 'none';
                return;
            }
            const popup = qS('#helper-popup');
            if (popup) {
                document.body.removeChild(popup);
            }
            const overlay = qS('#helper-overlay');
            if (overlay) {
                document.body.removeChild(overlay);
            }
        }
    });

    function createCloseButton(onclick) {
        const close_btn = docre('button');
        close_btn.className = 'helper-close-btn';
        close_btn.type = 'button';
        close_btn.addEventListener('click', onclick);
        return close_btn;
    }

    function createFollowListTable() {
        const table = docre('table');
        table.className = 'helper-follow-table';
        const table_head = docre('thead');
        table.appendChild(table_head);
        const title_row = table_head.insertRow();

        const followed_users = GM_getValue('followed_users', []);
        if (followed_users.length > 0) {
            const user_title = docre('th');
            const thread_title = docre('th');
            const follow_title = docre('th');
            user_title.textContent = '用户';
            thread_title.textContent = '关注内容';
            follow_title.textContent = '操作';
            [user_title, thread_title, follow_title].forEach(e => title_row.appendChild(e));

            const table_body = docre('tbody');
            table.appendChild(table_body);

            for (let user of followed_users) {
                const followed_threads = GM_getValue(user.uid + '_followed_threads', []);
                const user_URL_params = { 'loc': 'home', 'mod': 'space', 'uid': user.uid };

                if (followed_threads.some(e => e.tid == -1)) {
                    const row = table_body.insertRow();
                    const [user_cell, thread_cell, follow_cell] = [0, 1, 2].map(i => row.insertCell(i));

                    insertLink(user.name, user_URL_params, user_cell);
                    const thread_URL_params = { 'loc': 'home', 'mod': 'space', 'uid': user.uid, 'do': 'thread', 'view': 'me', 'type': 'reply', 'from': 'space' };
                    insertLink('所有回复', thread_URL_params, thread_cell);
                    follow_cell.appendChild(createFollowButton({ 'uid': user.uid, 'name': user.name, 'tid': -1, 'title': '所有回复' }));
                    continue;
                }

                for (let thread of followed_threads) {
                    const row = table_body.insertRow();
                    const [user_cell, thread_cell, follow_cell] = [0, 1, 2].map(i => row.insertCell(i));

                    insertLink(user.name, user_URL_params, user_cell);
                    let thread_URL_params;
                    if (thread.tid > 0) {
                        thread_URL_params = { 'loc': 'forum', 'mod': 'viewthread', 'tid': thread.tid };
                    }
                    else if (thread.tid == 0) {
                        thread_URL_params = { 'loc': 'home', 'mod': 'space', 'uid': user.uid, 'do': 'thread', 'view': 'me', 'from': 'space' };
                    }

                    insertLink(thread.title, thread_URL_params, thread_cell);
                    follow_cell.appendChild(createFollowButton({ 'uid': user.uid, 'name': user.name, 'tid': thread.tid, 'title': thread.title }));
                }
            }
        }
        else {
            const no_follow = docre('th');
            no_follow.textContent = '暂无关注';
            title_row.appendChild(no_follow);
        }
        return table;
    }

    function createHistoryNotificationTable() {
        const div = docre('div');
        const notification_messages = GM_getValue('notification_messages', []);
        if (notification_messages.length > 0) {
            notification_messages.forEach(message => { div.innerHTML += message; });
        }
        else {
            const p = docre('p');
            p.textContent = '暂无历史消息';
            div.appendChild(p);
        }
        return div;
    }

    function createDebugTable() {
        const div = docre('div');
        const all_value = GM_listValues();
        all_value.forEach(element => {
            const p = docre('p');
            p.textContent = element + ':' + JSON.stringify(GM_getValue(element));
            div.appendChild(p);
        });
        return div;
    }

    function createHelperSettingSelect(attr, options = [], texts = []) {
        const status = helper_setting[attr];
        if (options.length == 0) {
            options = [status];
        }

        const select = docre('select');
        select.className = 'helper-select helper-active-component';
        options.forEach(option => {
            const opt = docre('option');
            opt.value = option;
            opt.textContent = texts[options.indexOf(option)] || option;
            if (option == status) {
                opt.selected = true;
            }
            select.appendChild(opt);
        });

        select.addEventListener('change', (e) => {
            helper_setting[attr] = e.target.value;
            GM.setValue('helper_setting', helper_setting);
        });

        return select;
    }

    function createHelperSettingSwitch(attr) {
        const label = docre('label');

        const checkbox = docre('input');
        checkbox.type = 'checkbox';
        checkbox.checked = helper_setting[attr];
        checkbox.addEventListener('change', (e) => {
            helper_setting[attr] = e.target.checked;
            GM.setValue('helper_setting', helper_setting);
        });
        label.appendChild(checkbox);

        const span = docre('span');
        span.className = 'helper-toggle-switch helper-halfheight-active-component';
        label.appendChild(span);

        return label;
    }

    function createHelperSettingMultiCheck(multichecks) {
        const container = docre('div');
        container.className = 'helper-multicheck-container helper-active-component';

        multichecks.forEach(option => {
            const item = docre('div');
            item.className = 'helper-multicheck-item';

            const checkbox = docre('input');
            checkbox.type = 'checkbox';
            checkbox.checked = helper_setting[option.attr];
            checkbox.addEventListener('change', (e) => {
                helper_setting[option.attr] = e.target.checked;
                GM.setValue('helper_setting', helper_setting);
            });
            item.appendChild(checkbox);

            const item_text = docre('div');
            item_text.textContent = option.text;
            item_text.className = 'helper-multicheck-text';
            item_text.addEventListener('click', () => {
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            });
            item.appendChild(item_text);

            container.appendChild(item);
        });

        return container;
    }

    function createHelperSettingButton(btn_text, onclick) {
        const btn = docre('button');
        btn.type = 'button';
        btn.className = 'helper-setting-button helper-active-component';
        btn.textContent = btn_text;
        btn.addEventListener('click', onclick);

        return btn;
    }

    function createHelperActiveComponent(type, args) {
        switch (type) {
            case 'switch':
                return createHelperSettingSwitch(...args);
            case 'multicheck':
                return createHelperSettingMultiCheck(...args);
            case 'select':
                return createHelperSettingSelect(...args);
            case 'button':
                return createHelperSettingButton(...args);
            default:
                return docre('div');
        }
    }

    function createHelperSettingTable() {
        const div = docre('div');
        let components = [];

        // 开启更新通知
        components.push({ 'title': '订阅更新通知', 'type': 'switch', 'args': ['enable_notification'] });

        // 开启历史消息
        components.push({ 'title': '保存历史通知', 'type': 'switch', 'args': ['enable_history'] });

        // 选择下载内容
        components.push({ 'title': '主题保存内容', 'type': 'multicheck', 'args': [[{ 'attr': 'enable_text_download', 'text': '文本' }, { 'attr': 'enable_attach_download', 'text': '附件' }, { 'attr': 'enable_op_download', 'text': '原创资源' }]] });

        // 选择文件打包模式
        components.push({ 'title': '归档保存方式', 'type': 'select', 'args': ['files_pack_mode', ['no', 'single', 'all'], ['不归档', '分类归档', '全部归档']] });

        components.push({ 'title': '自动换行', 'type': 'switch', 'args': ['enable_auto_wrap'] });

        // 选择默认合并下载模式

        // 清除历史消息
        if (helper_setting.enable_history) {
            components.push({
                'title': '清空历史通知', 'type': 'button', 'args': ['全部清空', () => {
                    const confirm = window.confirm('确定清空所有历史通知？');
                    if (confirm) {
                        GM.deleteValue('notification_messages');
                        location.reload();
                    }
                }]
            });
        }

        // 清除脚本数据
        components.push({
            'title': '清空脚本数据', 'type': 'button', 'args': ['全部清空', () => {
                const confirm = window.confirm('确定清空脚本所有数据？');
                if (confirm) {
                    GM_listValues().forEach(e => GM.deleteValue(e));
                    location.reload();
                }
            }]
        });
        // 开启辅助换行
        // 开启黑名单

        components.forEach(component => {
            const container = docre('div');
            container.className = 'helper-setting-container';

            const text_node = docre('div');
            text_node.textContent = component.title;
            container.appendChild(text_node);

            const active_component = createHelperActiveComponent(component.type, component.args);
            container.appendChild(active_component);

            div.appendChild(container);
        });

        return div;
    }

    function createHelperPopup() {
        const overlay = docre('div');
        overlay.id = 'helper-overlay';
        overlay.addEventListener('click', () => {
            document.body.removeChild(popup);
            document.body.removeChild(overlay);
        });

        const popup = docre('div');
        popup.id = 'helper-popup';

        const helper_title_container = docre('div');
        helper_title_container.id = 'helper-title-container';
        popup.appendChild(helper_title_container);

        const helper_title = docre('div');
        helper_title.id = 'helper-title';
        helper_title.textContent = '湿热助手';
        helper_title_container.appendChild(helper_title);

        const close_btn = createCloseButton(() => {
            document.body.removeChild(popup);
            document.body.removeChild(overlay);
        });
        helper_title_container.appendChild(close_btn);

        const hr = docre('hr');
        hr.className = 'helper-hr';
        popup.appendChild(hr);

        const content_container = docre('div');
        content_container.id = 'helper-content-container';
        popup.appendChild(content_container);

        const tab_btn_container = docre('div');
        tab_btn_container.id = 'helper-tab-btn-container';
        tab_btn_container.className = 'helper-scroll-component';
        content_container.appendChild(tab_btn_container);

        const tab_content_container = docre('div');
        tab_content_container.id = 'helper-tab-content-container';
        tab_content_container.className = 'helper-scroll-component';
        content_container.appendChild(tab_content_container);

        const tabs = [{ 'name': '设置', 'func': createHelperSettingTable }];
        if (helper_setting.enable_notification) {
            tabs.push({ 'name': '关注列表', 'func': createFollowListTable });
        }
        if (helper_setting.enable_history) {
            tabs.push({ 'name': '历史消息', 'func': createHistoryNotificationTable });
        }
        if (helper_setting.enable_debug_mode) {
            tabs.push({ 'name': '调试', 'func': createDebugTable });
        }

        const show_tab = content => {
            tab_content_container.innerHTML = '';
            tab_content_container.appendChild(content)
        };

        tabs.forEach((tab, index) => {
            const btn = docre('button');
            btn.type = 'button';
            btn.className = 'helper-tab-btn';
            btn.textContent = tab.name;

            btn.addEventListener('click', () => {
                qSA('button', tab_btn_container).forEach(e => e.classList.remove('helper-tab-selected'));
                btn.classList.add('helper-tab-selected');
                show_tab(tab.func());
            });

            if (index == 0) {
                btn.classList.add('helper-tab-selected');
                show_tab(tab.func());
            }

            tab_btn_container.appendChild(btn);
        });

        document.body.appendChild(overlay);
        document.body.appendChild(popup);
    }

    function createNotificationPopup() {
        const popup = docre('div');
        popup.id = 'helper-notification-popup';
        document.body.appendChild(popup);

        const close_btn = createCloseButton(() => { popup.style.display = 'none' });
        close_btn.style.position = 'absolute';
        close_btn.style.top = '10px';
        close_btn.style.right = '10px';
        close_btn.classList.add('helper-redx');
        popup.appendChild(close_btn);
    }

    async function updateNotificationPopup() {
        const followed_users = await GM.getValue('followed_users', []);
        if (followed_users.length > 0) {
            let popup = qS('#helper-notification-popup');
            let notification_messages = [];
            let promises = [];
            for (let user of followed_users) {
                let followed_threads = GM_getValue(user.uid + '_followed_threads', []);
                for (let thread of followed_threads) {
                    promises.push(getUserNewestPostOrThread(user.uid, thread.tid, thread.last_tpid).then(new_infos => {
                        const new_threads = new_infos.new;
                        const found_last = new_infos.found;
                        const last_tpid = new_infos.last_tpid;

                        if (new_threads.length > 0) {
                            updateGMListElements(followed_threads, { 'tid': thread.tid, 'last_tpid': last_tpid, 'title': thread.title }, true, (a, b) => a.tid == b.tid);
                            updateGMList(user.uid + '_followed_threads', followed_threads);
                        }

                        if (thread.last_tpid == 0 || new_threads.length == 0) { // 如果没有更新，或者是首次关注，则不发送消息
                            return notification_messages;
                        }

                        if (!popup) {
                            createNotificationPopup();
                            popup = qS('#helper-notification-popup');
                        }

                        function createParaAndInsertUserNameLink(uid, parent) {
                            const messageElement = docre('div');
                            messageElement.className = 'helper-noti-message';
                            parent.appendChild(messageElement);
                            const user_URL_params = { 'loc': 'home', 'mod': 'space', 'uid': uid };
                            const user_link = insertLink(user.name, user_URL_params, messageElement);
                            user_link.className = 'helper-ellip-link';
                            user_link.style.maxWidth = '30%';
                            user_link.style.color = 'inherit !important';
                            return messageElement;
                        }

                        const div = docre('div');
                        if (thread.tid != 0) {
                            for (let new_thread of new_threads) {
                                const thread_title = new_thread.title;
                                const messageElement = createParaAndInsertUserNameLink(user.uid, div);
                                let message = ` 有`;
                                if (!found_last && thread.tid != -1) { // 在特定关注主题末页未找到不晚于last_pid的
                                    message += '至少';
                                }
                                message += `${new_thread.pids.length}条新回复在 `;
                                const text_element = document.createTextNode(message);
                                messageElement.appendChild(text_element);
                                const thread_URL_params = { 'loc': 'forum', 'mod': 'redirect', 'goto': 'findpost', 'ptid': new_thread.tid, 'pid': new_thread.pids.at(-1) };
                                const thread_message = insertLink(thread_title, thread_URL_params, messageElement);
                                thread_message.className = 'helper-ellip-link';
                            }
                            if (!found_last && thread.tid == -1) { // 在空间回复页首页未找到不晚于last_pid的
                                const messageElement = createParaAndInsertUserNameLink(user.uid, div);
                                const text_element2 = document.createTextNode(' 或有 ');
                                messageElement.appendChild(text_element2);
                                const reply_URL_params = { 'loc': 'home', 'mod': 'space', 'uid': user.uid, 'do': 'thread', 'view': 'me', 'type': 'reply', 'from': 'space' };
                                insertLink('更多新回复', reply_URL_params, messageElement);
                            }
                        }
                        else if (thread.tid == 0) {
                            const notif_num = new_threads.length > 3 ? 3 : new_threads.length;
                            for (let i = 0; i < notif_num; i++) {
                                const messageElement = createParaAndInsertUserNameLink(user.uid, div);
                                const text_element = document.createTextNode(' 有新帖 ');
                                messageElement.appendChild(text_element);
                                const thread_URL_params = { 'loc': 'forum', 'mod': 'viewthread', 'tid': new_threads[i].tid };
                                const thread_message = insertLink(new_threads[i].title, thread_URL_params, messageElement);
                                thread_message.className = 'helper-ellip-link';
                            }
                            if (new_threads.length > 3) {
                                const messageElement = createParaAndInsertUserNameLink(user.uid, div);
                                let message = ` 有另外 `;
                                if (!found_last) {
                                    message += '至少';
                                }
                                const text_element = document.createTextNode(message);
                                messageElement.appendChild(text_element);
                                const thread_URL_params = { 'loc': 'home', 'mod': 'space', 'uid': user.uid, 'do': 'thread', 'view': 'me', 'from': 'space' };
                                insertLink(`${new_threads.length - 3}条新帖`, thread_URL_params, messageElement);
                            }
                        }
                        popup.appendChild(div);
                        notification_messages.push(div.innerHTML);

                        return notification_messages;
                    }));
                }
            }

            if (helper_setting.enable_history) {
                await Promise.all(promises);
                const old_notification_messages = GM_getValue('notification_messages', []);
                notification_messages = notification_messages.concat(old_notification_messages);
                updateGMList('notification_messages', notification_messages);
            }
        }
    }

    // ========================================================================================================
    // 插入表情相关
    // ========================================================================================================
    async function modifySmiliesArray(new_smilies) {
        await checkVariableDefined('smilies_array');
        for (let smilies of new_smilies) {
            smilies_type['_' + smilies.type] = [smilies.name, smilies.path];
            smilies_array[smilies.type] = new Array();
            smilies_array[smilies.type][1] = smilies.info;
        }
    }

    async function modifySmiliesSwitch(original_smilies_types, mode = 'img') {
        await checkVariableDefined('smilies_switch');
        let smilies_switch_str = unsafeWindow['smilies_switch'].toString();
        smilies_switch_str = smilies_switch_str.replace("STATICURL+'image/smiley/'+smilies_type['_'+type][1]+'/'", `('${original_smilies_types}'.split(',').includes(type.toString())?(STATICURL+'image/smiley/'+smilies_type['_'+type][1]+'/'):smilies_type['_'+type][1])`);
        if (mode == 'img') {
            // TODO fastpost时有问题
            smilies_switch_str = smilies_switch_str.replace("'insertSmiley('+s[0]+')'", `"insertText('[img]"+smilieimg+"[/img]',strlen('[img]"+smilieimg+"[/img]'),0)"`);
        }
        smilies_switch = new Function('return ' + smilies_switch_str)();
    }


    async function insertExtraSmilies(id, seditorkey, original_smilies_types, new_smilies) {
        await modifySmiliesArray(new_smilies);
        await modifySmiliesSwitch(original_smilies_types, 'img');
        smilies_show(id, 8, seditorkey);
    }

    async function modifyBBCode2Html(original_smilies_types) {
        // 可以正常使用，但由于modifyPostOnSubmit的缘故，同步弃用
        await checkVariableDefined('bbcode2html');
        let bbcode2html_str = unsafeWindow['bbcode2html'].toString();
        bbcode2html_str = bbcode2html_str.replace("STATICURL+'image/smiley/'+smilies_type['_'+typeid][1]+'/'", `('${original_smilies_types}'.split(',').includes(typeid.toString())?(STATICURL+'image/smiley/'+smilies_type['_'+typeid][1]+'/'):smilies_type['_'+typeid][1])`);
        bbcode2html_str = bbcode2html_str.replace("}if(!fetchCheckbox('bbcodeoff')&&allowbbcode){", "}if(!fetchCheckbox('bbcodeoff')&&allowbbcode){")
        bbcode2html = new Function('return ' + bbcode2html_str)();
    }

    async function modifyPostOnSubmit(submit_id, original_smilies_types) {
        // TODO 不知道为什么，不这么做的话自定义表情在提交时会被转义成bbcode
        // TODO 但是对于fastpost的情况还是没法处理，所以暂时弃用
        const post = qS('#' + submit_id);
        submit_id = submit_id.replace('form', '');
        // const original_onsubmit_str = post.getAttribute('onsubmit').toString();
        // console.log(original_onsubmit_str);
        post.setAttribute('onsubmit', `if(typeof smilies_type == 'object'){for (var typeid in smilies_array){for (var page in smilies_array[typeid]){for(var i in smilies_array[typeid][page]){re=new RegExp(preg_quote(smilies_array[typeid][page][i][1]),"g");this.message.value=this.message.value.replace(re,'[img]'+('${original_smilies_types}'.split(',').includes(typeid.toString())?(STATICURL+'image/smiley/'+ smilies_type['_' + typeid][1] + '/'):smilies_type['_' + typeid][1])+smilies_array[typeid][page][i][2]+"[/img]");}}}}`);
    }

    // ========================================================================================================
    // 主体运行
    // ========================================================================================================
    insertHelperLink();

    const helper_setting = GM_getValue('helper_setting', {});
    let default_update = false;
    for (let key in helper_default_setting) {
        if (!(key in helper_setting)) {
            helper_setting[key] = helper_default_setting[key];
            default_update = true;
        }
    }
    if (default_update) {
        GM.setValue('helper_setting', helper_setting);
    }

    if (helper_setting.enable_notification) {
        updateNotificationPopup();
    }

    if (hasReadPermission()) {
        if (location_params.loc == 'forum') {
            if (location_params.mod == 'viewthread') {
                modifyPostPage();
                // insertExtraSmilies('fastpostsmiliesdiv', 'fastpost', original_smilies_types, new_smilies);
                // modifyPostOnSubmit('fastpostform', original_smilies_types);
            }
            if (location_params.mod == 'post') {
                // insertExtraSmilies('smiliesdiv', 'e_', original_smilies_types, new_smilies);
                // modifyBBCode2Html(original_smilies_types);
                // modifyPostOnSubmit('postform', original_smilies_types);
            }
            if (location_params.mod == 'forumdisplay') {
                // insertExtraSmilies('fastpostsmiliesdiv', 'fastpost', original_smilies_types, new_smilies);
                // modifyPostOnSubmit('fastpostform', original_smilies_types);
            }
        }

        if (location_params.loc == 'home') {
            if (location_params.mod == 'space') {
                modifySpacePage();
            }
        }
    }

})();

// 最优先
// TODO 站务着色
// TODO 版面浮动名片、好友浮动名片添加关注
// TODO 代表作
// TODO 合并保存选项
// TODO 自动回复
// TODO op未加载的情况
// TODO tg详情
// TODO chrome支持

// 次优先
// TODO 屏蔽词
// TODO 黑名单
// TODO 一键删除

// 末优先
// TODO 用户改名提醒
// TODO NSFW（跳过题图）
// TODO 图片预览

// 热更新
// TODO 保证弹窗弹出
// TODO debug log
// TODO 异常处理
// TODO 关注按钮联动
// TODO 按钮hover
// TODO 动态tab

// 更多设置
// TODO 换行参数

// 调试
// TODO 导出关注
// TODO 删除键值

// 优化
// insertHelperLink
// checked_posts
// firefox
// hover text
// innertext

// 搁置: 不会
// TODO 上传表情
// TODO 表情代码
// TODO sticky

// 搁置: 麻烦
// TODO 置顶重复
// TODO 无选中时会下载空文件
// TODO md格式
// TODO 下载进度条

// 搁置：负载
// TODO 上一集、下一集


// NOTE 可能会用到 @require https://scriptcat.org/lib/513/2.0.0/ElementGetter.js
