// ==UserScript==
// @name         shire helper
// @namespace    http://tampermonkey.net/
// @version      0.5.5.6
// @description  Download shire thread content.
// @author       Crash
// @match        https://www.shireyishunjian.com/*
// @match        https://www.shishirere.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=shireyishunjian.com
// @grant        GM.getValue
// @grant        GM_getValue
// @grant        GM.setValue
// @grant        GM_setValue
// @grant        GM.deleteValue
// @grant        GM_deleteValue
// @grant        GM.listValues
// @grant        GM_listValues
// @grant        GM_xmlhttpRequest
// @downloadURL  https://update.greasyfork.org/scripts/461311/shire%20article%20saver.user.js
// @updateURL    https://update.greasyfork.org/scripts/461311/shire%20article%20saver.user.js
// ==/UserScript==

(function () {
    'use strict';

    // ========================================================================================================
    // 常量和简单的工具函数
    // ========================================================================================================
    const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1 Edg/125.0.0.0';
    const large_page_num = 1024;
    const magic_num = Math.sqrt(large_page_num);

    const qS = (selector, parent = document) => parent.querySelector(selector);
    const qSA = (selector, parent = document) => parent.querySelectorAll(selector);
    String.prototype.parseURL = function () {
        let obj = {};
        this.replace(/([^?=&#]+)=([^?=&#]+)/g, (_, key, value) => { obj[key] = value });
        this.replace(/#([^?=&#]+)/g, (_, hash) => { obj.hash = hash });
        this.replace(/(\w+)\.php/, (_, loc) => { obj.loc = loc });
        return obj;
    };


    const location_params = location.href.parseURL();
    const is_not_mobile = location_params.mobile == 'no' || Array.from(qSA('meta')).some(meta => meta.getAttribute('http-equiv') === 'X-UA-Compatible');

    if (!is_not_mobile) {
        return;
    }

    const hasReadPermission = (doc = document) => !Boolean(qS('#messagetext', doc));
    const isFirstPage = (doc = document) => { const page = doc.URL.parseURL().page; return !Boolean(page) || page == 1; }
    const hasThreadInPage = (doc = document) => { const thread_list = qS('#delform > table > tbody > tr:not(.th)', doc); return Boolean(thread_list) && thread_list.childNodes.length > 3; }

    const getPostId = post => post.id.slice(3);
    const getPostsInPage = (page_doc = document) => qSA('[id^=pid]', page_doc);
    const getSpaceAuthor = (page_doc = document) => qS('head > meta:nth-child(6)').content.slice(0, -3);

    // ========================================================================================================
    // 自定义样式
    // ========================================================================================================
    const nofication_popup_style = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 300px;
        background-color: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 20px;
        border-radius: 5px;
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
        font-family: Arial, sans-serif;
        z-index: 10000;
    `;

    const nofication_popup_close_btn_style = `
        position: absolute;
        top: 10px;
        right: 10px;
        background-color: transparent;
        color: #ff5c5c;
        border: none;
        font-size: 20px;
        font-weight: bold;
        cursor: pointer;
    `;

    const followed_list_popup_style = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        padding: 20px;
        background: white;
        border: 1px solid black;
        z-index: 10000;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    `;

    const followed_list_popup_close_btn_style = `
        position: absolute;
        top: 5px;
        right: 10px;
        cursor: pointer;
    `;

    const follow_list_table_style = `
        width: 100%;
        border-collapse: collapse;
    `;

    // ========================================================================================================
    // 更新GM Value的函数
    // ========================================================================================================
    function updateGMListElements(list, elem, status, equal = (a, b) => a == b) {
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
    };

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
            const http_request = new XMLHttpRequest();
            http_request.open('GET', url, false);
            http_request.send()
            const page_doc = new DOMParser().parseFromString(http_request.responseText, 'text/html');
            return page_doc;
        }
        else {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    headers: { 'User-Agent': UA },
                    onload: response => {
                        const page_doc = new DOMParser().parseFromString(response.responseText, 'text/html');
                        resolve(page_doc);
                    }
                });
            });
        }
    }

    // ========================================================================================================
    // 获取帖子正文内容的函数
    // ========================================================================================================
    function getPostContent(pid, page_doc = document) {
        const tf = qS('#postmessage_' + pid, page_doc);
        let children_nodes = tf.childNodes;
        let text = '';
        for (let child of children_nodes) {
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

    async function getPageContent(page_doc, type = 'main') {
        const tid = page_doc.URL.parseURL().tid;
        const checked_posts = await GM.getValue(tid + '_checked_posts', []);
        const posts_in_page = getPostsInPage(page_doc);

        let text = '';
        for (let post of posts_in_page) {
            if (type == 'checked') {
                const post_id = getPostId(post);
                if (!checked_posts.includes(post_id)) {
                    continue;
                }
            }
            const post_info = getPostInfo(post, page_doc);
            const post_content = getPostContent(post_info.post_id, page_doc);
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
        return { 'text': text, 'image': [] };
    }

    // ========================================================================================================
    // 保存与下载的函数
    // ========================================================================================================
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

    async function saveThread(type = 'main') {
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
                    filename += '（全帖）';
                }


                const page_num = (qS('#pgt > div > div > label > span') || { 'title': '共 1 页' }).title.match(/共 (\d+) 页/)[1];
                for (let page_id = 1; page_id <= page_num; page_id++) {
                    const URL_params = { 'loc': 'forum', 'mod': 'viewthread', 'tid': thread_id, 'page': page_id };
                    if (is_only_author) {
                        URL_params.authorid = author.id;
                    }

                    const page_doc = await getPageDocInDomain(URL_params);
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
                    const URL_params = { 'loc': 'forum', 'mod': 'viewthread', 'tid': thread_id, 'page': page_id };
                    if (specific_authorid) {
                        URL_params.authorid = specific_authorid;
                    }
                    const page_doc = await getPageDocInDomain(URL_params);
                    const page_content = (await getPageContent(page_doc, 'checked')).text;
                    content += page_content;
                }
                saveFile(filename, content);
                GM.deleteValue(thread_id + '_checked_posts');
            }
                break;
        }
    }

    async function saveMergedThreads() {
        const uid = location.href.parseURL().uid;
        let checked_threads = GM_getValue(uid + '_checked_threads', []);

        let filename = '合并贴';
        let content = '';
        for (let tid of checked_threads.sort()) {
            let thread_content = '';
            const URL_params = { 'loc': 'forum', 'mod': 'viewthread', 'tid': tid };
            const thread_doc = await getPageDocInDomain(URL_params);
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

    // ========================================================================================================
    // 获取关注用户最新动态的函数
    // ========================================================================================================
    async function getUserNewestPostOrThread(uid, tid, last_tpid = 0) {
        // 返回结构：
        // { 'new': [{ 'tpid': tid, 'title': title, 'reply_num': reply_num }], 'found': found, 'last_tpid': last_tpid }
        // 其中对于reply_num可undefined
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
        const URL_params = { 'loc': 'home', 'mod': 'space', 'uid': uid, 'do': 'thread', 'view': 'me', 'type': 'reply', 'from': 'space', 'mobile': 2 };
        const followed_threads = GM_getValue(uid + '_followed_threads', []);
        const follow_tids = followed_threads.map(e => e.tid).filter(e => e > 0);
        const page_doc = await getPageDocInDomain(URL_params, mobileUA);
        const threads_in_page = qSA('#home > div.threadlist.cl > ul > li', page_doc);
        let new_replyed_threads = [];
        let found = false;
        let new_last_pid = 0;
        if (threads_in_page.length > 0) {
            for (let thread of threads_in_page) {
                const reply_in_thread = qSA('a', thread);
                const tid = reply_in_thread[0].href.parseURL().tid;
                const title = reply_in_thread[0].textContent.trim()
                let new_reply_num = reply_in_thread.length - 1;
                for (let i = 1; i < reply_in_thread.length; i++) {
                    const pid = reply_in_thread[i].href.parseURL().pid;
                    if (new_last_pid == 0) {
                        new_last_pid = pid;
                    }
                    if (pid <= last_pid) {
                        found = true;
                        new_reply_num = i - 1;
                        break;
                    }
                }
                if (new_reply_num > 0 && !follow_tids.includes(tid)) {
                    new_replyed_threads.push({ 'tid': tid, 'title': title, 'reply_num': new_reply_num });
                }
            }
        }
        last_pid = new_last_pid == 0 ? 1 : new_last_pid;
        return { 'new': new_replyed_threads, 'found': found, 'last_tpid': last_pid };
    }

    async function getUserNewestThread(uid, last_tid = 0) {
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
        const URL_params = { 'loc': 'forum', 'mod': 'viewthread', 'tid': tid, 'authorid': uid, 'page': large_page_num, 'mobile': 2 };
        const page_doc = await getPageDocInDomain(URL_params, mobileUA);
        const posts_in_page = getPostsInPage(page_doc);
        const thread_title = qS('head > title', page_doc).textContent.slice(0, -8);
        let new_posts = [];
        let found = false;
        let reply_num = 0;
        for (let i = posts_in_page.length - 1; i >= 0; i--) {
            const post = posts_in_page[i];
            const post_id = getPostId(post);
            if (post_id <= last_pid) {
                found = true;
                break;
            }
            reply_num++;
            if (last_pid == 0) {
                break;
            }
        }
        if (reply_num > 0) {
            new_posts.push({ 'tid': tid, 'title': thread_title, 'reply_num': reply_num });
        }
        last_pid = getPostId(posts_in_page[posts_in_page.length - 1]);
        return { 'new': new_posts, 'found': found, 'last_tpid': last_pid };
    }

    // ========================================================================================================
    // 修改页面内容的函数
    // ========================================================================================================
    function insertFollowedListLink() {
        let insert_li = qS('#myitem_menu > li:nth-child(3)')
        if (!insert_li) {
            insert_li = qS('#myspace_menu > li:nth-child(5)')
        }
        if (insert_li) {
            const follow_li = document.createElement('li');
            insertInteractiveLink('关注', () => { if (!qS('#followed-list-popup')) { createFollowedListPopup() } }, follow_li);
            insert_li.parentNode.appendChild(follow_li);
        }

    }
    function insertElement(elem, pos, type = 'append') {
        switch (type) {
            case 'append':
                pos.appendChild(elem);
                break;
            case 'insertBefore':
                pos.parentNode.insertBefore(elem, pos);
                break;
            case 'insertAfter':
                pos.parentNode.insertBefore(elem, pos.nextSibling);
                break;
        }
    }

    function insertInteractiveLink(text, func, pos, type = 'append') {
        const a = document.createElement('a');
        a.href = 'javascript:void(0)';
        a.textContent = text;
        a.addEventListener('click', func);
        insertElement(a, pos, type);
    }

    function insertLink(text, URL_params, pos, max_text_length = 0, type = 'append') {
        const a = document.createElement('a');
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
    }

    function insertFollowBtn(info, pos, type = 'append') {
        let unfollowed_text;
        let followed_text;
        switch (info.tid) {
            case -1: {
                unfollowed_text = '特别关注';
                followed_text = '取消特关';
                info.title = '所有回复';
            }
                break;
            case 0: {
                unfollowed_text = '关注';
                followed_text = '取关';
                info.title = '所有主题';
            }
                break;
            default: {
                unfollowed_text = '在本帖关注';
                followed_text = '在本帖取关';
            }
        }

        const follow_btn = document.createElement('button');
        const follow_status = GM_getValue(info.uid + '_followed_threads', []);
        const followed = follow_status.some(e => e.tid == info.tid);
        follow_btn.textContent = followed ? followed_text : unfollowed_text;
        follow_btn.addEventListener('click', async () => {
            const followed_num = GM_getValue('followed_num', 0);
            if (followed_num >= magic_num) {
                alert('关注数已达上限，请及时清理关注列表.');
                return;
            }
            const follow_status = GM_getValue(info.uid + '_followed_threads', []);
            const followed = follow_status.some(e => e.tid == info.tid);
            follow_btn.textContent = !followed ? followed_text : unfollowed_text;
            recordFollow(info, !followed);
            if (info.tid == -1 && !followed) {
                recordFollow({ 'uid': info.uid, 'name': info.name, 'tid': 0, 'title': '所有主题' }, true);
            }
        });
        insertElement(follow_btn, pos, type);
    }

    async function updatePostInPage() {
        const tid = location.href.parseURL().tid;
        const checked_posts = await GM.getValue(tid + '_checked_posts', []);
        const posts_in_page = getPostsInPage();
        const thread_title = qS('#thread_subject').textContent;
        let all_checked = true;

        for (let post of posts_in_page) {
            const post_info = getPostInfo(post);
            const pid = post_info.post_id;
            const uid = post_info.post_auth_id;

            // 添加保存复选框
            const label = document.createElement('label');
            const label_text = document.createTextNode('保存本层');
            label.className = 'x1 xl2 o cl';
            label.appendChild(label_text);
            qS('tbody > tr:nth-child(1) > td.pls > div', post).appendChild(label);

            const checkbox = document.createElement('input');
            checkbox.id = 'post_check_' + pid;
            checkbox.type = 'checkbox';
            checkbox.checked = checked_posts.includes(pid);
            checkbox.addEventListener('change', () => { recordCheckbox(`${tid}_checked_posts`, checkbox.id, checkbox.checked) });// 每个Thread设置一个数组，存入被选中的Post的ID
            label.appendChild(checkbox);

            all_checked = all_checked && checkbox.checked;
            // 结束添加保存复选框

            // 添加关注按钮
            const profile_icon = qS('[id^=userinfo] > div.i.y > div.imicn', post)
            insertFollowBtn({ 'uid': uid, 'name': post_info.post_auth, 'tid': 0 }, profile_icon);
            const user_level = qS('[id^=favatar] > p:nth-child(5)', post)
            insertFollowBtn({ 'uid': uid, 'name': post_info.post_auth, 'tid': tid, 'title': thread_title }, user_level);
            // 结束添加关注按钮
        }

        const label = document.createElement('label');
        const label_text = document.createTextNode(all_checked ? '清空全选' : '全选本页');
        label.appendChild(label_text);
        qS('#postlist > table:nth-child(1) > tbody > tr > td.plc.ptm.pbn.vwthd > div').appendChild(label);

        const checkbox = document.createElement('input');
        checkbox.id = 'page_checked_all';
        checkbox.type = 'checkbox';
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

            checkbox.addEventListener('change', () => { recordCheckbox(`${uid}_checked_threads`, checkbox.id, checkbox.checked) });// 每个用户设置一个数组，存入被选中的Thread的ID
        }
    }

    async function modifyPostPage() {
        const author = getThreadAuthorInfo();
        const is_only_author = location.href.parseURL().authorid == author.id;

        updatePostInPage();

        if (isFirstPage()) {
            insertInteractiveLink('保存主楼  ', () => saveThread(), qS('#postlist > div > table > tbody > tr:nth-child(1) > td.plc > div.pi > strong'));

            if (is_only_author) {
                insertInteractiveLink('保存作者  ', () => saveThread("page"), qS('#postlist > table:nth-child(1) > tbody > tr > td.plc.ptm.pbn.vwthd > div'));
            }
            else {
                insertInteractiveLink('保存全帖  ', () => saveThread("page"), qS('#postlist > table:nth-child(1) > tbody > tr > td.plc.ptm.pbn.vwthd > div'));
            }
        }

        insertInteractiveLink('保存选中  ', () => saveThread("checked"), qS('#postlist > table:nth-child(1) > tbody > tr > td.plc.ptm.pbn.vwthd > div'));
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
            insertFollowBtn({ 'uid': URL_info.uid, 'name': name, 'tid': URL_info.type == 'reply' ? -1 : 0 }, toptb);
        }
    }

    // ========================================================================================================
    // 浮动弹窗相关
    // ========================================================================================================
    function createFollowedListPopup() {
        const popup = document.createElement('div');
        popup.id = 'followed-list-popup';
        popup.style = followed_list_popup_style;
        document.body.appendChild(popup);

        const close_btn = document.createElement('button');
        close_btn.className = 'close-btn';
        close_btn.style = followed_list_popup_close_btn_style;
        close_btn.onclick = () => { document.body.removeChild(popup) };
        close_btn.textContent = '✖';
        popup.appendChild(close_btn);

        const table = document.createElement('table');
        table.style = follow_list_table_style;
        const followed_users = GM_getValue('followed_users', []);
        if (followed_users.length > 0) {
            for (let user of followed_users) {
                const followed_threads = GM_getValue(user.uid + '_followed_threads', []);
                for (let thread of followed_threads) {
                    const row = table.insertRow();
                    const user_cell = row.insertCell(0);
                    const thread_cell = row.insertCell(1);
                    const follow_cell = row.insertCell(2);

                    const user_URL_params = { 'loc': 'home', 'mod': 'space', 'uid': user.uid };
                    insertLink(user.name, user_URL_params, user_cell);
                    let thread_URL_params;
                    if (thread.tid > 0) {
                        thread_URL_params = { 'loc': 'forum', 'mod': 'viewthread', 'tid': thread.tid };
                    }
                    else if (thread.tid == 0) {
                        thread_URL_params = { 'loc': 'home', 'mod': 'space', 'uid': user.uid, 'do': 'thread', 'view': 'me', 'from': 'space' };
                    }
                    else if (thread.tid == -1) {
                        thread_URL_params = { 'loc': 'home', 'mod': 'space', 'uid': user.uid, 'do': 'thread', 'view': 'me', 'type': 'reply', 'from': 'space' };
                    }
                    insertLink(thread.title, thread_URL_params, thread_cell, 10);
                    insertFollowBtn({ 'uid': user.uid, 'name': user.name, 'tid': thread.tid, 'title': thread.title }, follow_cell);

                    user_cell.style.padding = '8px';
                    thread_cell.style.padding = '8px';
                    follow_cell.style.padding = '8px';
                    follow_cell.style.textAlign = 'center';
                }
            }
        }
        else {
            const row = table.insertRow();
            const cell = row.insertCell();
            cell.textContent = '暂无关注';
            cell.style.textAlign = 'center';
            cell.style.padding = '8px';
        }
        popup.appendChild(table);
    }

    function createNotificationPopup() {
        const popup = document.createElement('div');
        popup.id = 'nofication-popup';
        popup.style = nofication_popup_style;
        document.body.appendChild(popup);

        const close_btn = document.createElement('button');
        close_btn.className = 'close-btn';
        close_btn.style = nofication_popup_close_btn_style;
        close_btn.onclick = () => { popup.style.display = 'none' };
        close_btn.textContent = '✖';
        popup.appendChild(close_btn);
    }

    async function updateNotificationPopup() {
        const followed_users = await GM.getValue('followed_users', []);
        if (followed_users.length > 0) {
            let popup = qS('#nofication-popup');
            for (let user of followed_users) {
                let followed_threads = (await GM.getValue(user.uid + '_followed_threads', []));
                for (let thread of followed_threads) {
                    getUserNewestPostOrThread(user.uid, thread.tid, thread.last_tpid).then(new_infos => {
                        const new_threads = new_infos.new;
                        const found_last = new_infos.found;
                        const last_tpid = new_infos.last_tpid;

                        if (new_threads.length > 0) {
                            updateGMListElements(followed_threads, { 'tid': thread.tid, 'last_tpid': last_tpid, 'title': thread.title }, true, (a, b) => a.tid == b.tid);
                            updateGMList(user.uid + '_followed_threads', followed_threads);
                        }

                        if (thread.last_tpid == 0 || new_threads.length == 0) {
                            return;
                        }

                        if (!popup) {
                            createNotificationPopup();
                            popup = qS('#nofication-popup');
                        }

                        if (thread.tid != 0) {
                            for (let new_thread of new_threads) {
                                const thread_title = new_thread.title;
                                const messageElement = document.createElement('p');
                                popup.appendChild(messageElement);
                                const user_URL_params = { 'loc': 'home', 'mod': 'space', 'uid': user.uid };
                                insertLink(user.name, user_URL_params, messageElement);
                                const text_element = document.createTextNode(' 在 ');
                                messageElement.appendChild(text_element);
                                const thread_URL_params = { 'loc': 'forum', 'mod': 'viewthread', 'tid': new_thread.tid, 'page': large_page_num };
                                insertLink(thread_title, thread_URL_params, messageElement, 10);
                                let message = ` 中有`;
                                if (!found_last && thread.tid != -1) {
                                    message += '超过';
                                }
                                message += `${new_thread.reply_num}条新回复`;
                                const text_element2 = document.createTextNode(message);
                                messageElement.appendChild(text_element2);
                            }
                            if (!found_last && thread.tid == -1) {
                                const messageElement = document.createElement('p');
                                popup.appendChild(messageElement);
                                const user_URL_params = { 'loc': 'home', 'mod': 'space', 'uid': user.uid };
                                insertLink(user.name, user_URL_params, messageElement);
                                const text_element2 = document.createTextNode(' 还有');
                                messageElement.appendChild(text_element2);
                                const reply_URL_params = { 'loc': 'home', 'mod': 'space', 'uid': user.uid, 'do': 'thread', 'view': 'me', 'type': 'reply', 'from': 'space' };
                                insertLink('更多新回复', reply_URL_params, messageElement);
                            }
                        }
                        else if (thread.tid == 0) {
                            const notif_num = new_threads.length > 3 ? 3 : new_threads.length;
                            for (let i = 0; i < notif_num; i++) {
                                const messageElement = document.createElement('p');
                                popup.appendChild(messageElement);
                                const user_URL_params = { 'loc': 'home', 'mod': 'space', 'uid': user.uid };
                                insertLink(user.name, user_URL_params, messageElement);
                                const text_element = document.createTextNode(' 的新帖 ');
                                messageElement.appendChild(text_element);
                                const thread_URL_params = { 'loc': 'forum', 'mod': 'viewthread', 'tid': new_threads[i].tid };
                                insertLink(new_threads[i].title, thread_URL_params, messageElement, 10);
                            }
                            if (new_threads.length > 3) {
                                const messageElement = document.createElement('p');
                                popup.appendChild(messageElement);
                                const user_URL_params = { 'loc': 'home', 'mod': 'space', 'uid': user.uid };
                                insertLink(user.name, user_URL_params, messageElement);
                                let message = ` 还有 `;
                                if (!found_last) {
                                    message += '超过';
                                }
                                const text_element = document.createTextNode(message);
                                messageElement.appendChild(text_element);
                                const thread_URL_params = { 'loc': 'home', 'mod': 'space', 'uid': user.uid, 'do': 'thread', 'view': 'me', 'from': 'space' };
                                insertLink(`${new_threads.length - 3}条新帖`, thread_URL_params, messageElement);
                            }
                        }
                    })
                }
            }
        }
    }


    // ========================================================================================================
    // 主体运行
    // ========================================================================================================
    updateNotificationPopup();
    insertFollowedListLink();

    if (hasReadPermission()) {
        if (location_params.loc == 'forum' && location_params.mod == 'viewthread') {
            modifyPostPage();
        }

        if (location_params.loc == 'home' && location_params.mod == 'space') {
            modifySpacePage();
        }
    }
})();



// TODO 合并贴标题
// TODO 下载并发改进

// TODO 弹窗样式美化
// TODO 点击弹窗外关闭

// TODO 关注上限

// TODO 历史消息
// TODO 清除数据
