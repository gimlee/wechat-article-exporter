
# 开发提示词

# P1
当前系统执行如下命令：
yarn
yarn dev
报错，无法启动系统。
之前还可以，我什么都没有该，请解决

# P2
它这个系统中，
同步消息，公众号抓取，在导出之前说是放在IndexedDB中，那这个IndexedDB具体位置在哪里？
IndexedDB最大能放多少数据呢？

## AI回答：

如果你访问的是线上域名，比如 https://xxx.com，那会是另一个 origin，对应另一个 IndexedDB 存储，不会和 localhost:3000 共用。

不是项目自己设的固定大小，而是浏览器按“当前 origin”动态分配的存储配额。
根据 MDN，IndexedDB 属于浏览器统一 storage quota 管理，不同浏览器不同；Chrome / Edge 这类 Chromium 浏览器，一个 origin 理论上最多可到磁盘总容量的约 60%，但实际会受剩余磁盘空间、浏览器策略、隐私模式、系统清理等影响。Firefox 普通模式通常按磁盘总量 10% 或 10 GiB 较小者，持久化后更高。Safari 新版本浏览器应用也大约可到 60% 总磁盘。来源：MDN Storage quotas 文档。

补一句关键的：IndexedDB 默认是“best-effort”存储，正常不会轻易丢，但如果磁盘空间紧张、用户清理浏览器数据、隐身模式结束，浏览器可以清掉它。导出前缓存大量公众号文章一般没问题，但不能把它当成永久数据库。


# P3
端口哪里配置，我需要把端口配置写死。
答：
nuxt.config.ts (line 7)

# P4
我需要把所有文章下载下来，然后清洗如PG、入qdrant。
入qdrant是为了以后创作时候，找到相似的文章的片段，引用该片段。
我应该保存为html还是markdown格式？
我看了导出的markdown格式文章有大量的非法字符，不是文章内容。见：C:\Users\gimlee\Downloads\公众号文章 中的内容。

## AI回答：
长期保存：HTML。入 Qdrant：清洗后的纯文本或干净 Markdown。

更具体一点：
raw_html：保存原始 HTML，作为可追溯原件，未来清洗规则变了可以重新处理。
clean_markdown：保存清洗后的正文 Markdown，用于人工查看、引用展示。
clean_text：保存去掉样式、脚本、广告、按钮、阅读数等噪声后的正文，用于 embedding。
qdrant：不要塞整篇文章，塞分片后的 clean_text chunk，payload 里带标题、公众号、URL、发布时间、chunk 序号、原文路径、clean_markdown 片段。
如果只选一个格式保存，我会选 HTML，因为 HTML 信息最完整；但如果只选一个格式入向量库，我会选 清洗后的纯文本/Markdown，不是原始 HTML。


推荐流程：
IndexedDB / 导出的 HTML
        ↓
解析 #js_article / #js_content / cgiDataNew
        ↓
去 script/style/css/底部栏/评论区/无关按钮/隐藏节点
        ↓
生成 clean_text + clean_markdown
        ↓
按 500-1000 中文字分片
        ↓
embedding
        ↓
写入 Qdrant，payload 保留引用信息
{
  "id": "articleId_chunk_001",
  "vector": [/* embedding */],
  "payload": {
    "title": "AI手机时代，Mobile Agent最缺是更真实的世界",
    "account": "机器之心",
    "url": "https://mp.weixin.qq.com/s/...",
    "published_at": "2026-06-06",
    "chunk_index": 1,
    "text": "这里是清洗后的正文片段...",
    "html_path": ".../index.html"
  }
}
所以你的方向应该是：HTML 做原始档案，clean Markdown/clean text 做知识库材料，Qdrant 存 chunk。 当前导出的 Markdown 需要修导出逻辑或另写清洗脚本后再入库。

# P5
