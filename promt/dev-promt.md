
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
我才下载了3000篇左右的文章，就已经占用 10G空间，文章有几万篇，会把我C盘撑爆。
有办法一边抓取，一边导出，然后把已经下载的文章删掉吗？
至少要加个字段已导出，然后增加按钮，清除已导出文件的放在IndexedDB中内容。
IndexedDB支持这种删除方式吗？
你有什么好办法没有，先不要实现。

# P6
你只需要管理IndexedDB中不把C盘撑爆就行了，后面的清洗、入qdrant不在此项目中。
给个具体实现方案，需要解决我C盘会撑爆的问题。

## AI回答：
目标就定成一句话：**IndexedDB 只做临时缓存，不做长期仓库。导出成功后，立刻释放该文章在 IndexedDB 里的大体积内容。**

我建议具体这样做。
**核心方案**
给文章加状态字段，但只保留轻量索引，不保留正文和资源。
在 `article` 表里新增这些字段：
```ts
exportedAt?: number
exportedFormats?: string[]
purgedAt?: number
cacheSize?: number
```

含义：
- `exportedAt`：这篇文章至少成功导出过一次
- `exportedFormats`：导出过哪些格式，比如 `html`、`markdown`
- `purgedAt`：IndexedDB 里的大缓存已经清理
- `cacheSize`：可选，用来估算释放空间

清理时保留 `article` 表记录，只删这些大对象表：
```text
html
resource
resource-map
asset
comment
comment_reply
metadata
debug
```

其中最占空间的大概率是：
```text
html.file
resource.file
asset / 图片资源 Blob
```

**导出后自动清理**
不要只靠手动按钮。真正解决 C 盘爆掉，要做自动清理。
流程改成：

```text
抓取文章
  ↓
写入 IndexedDB
  ↓
导出到你选择的文件夹
  ↓
确认文件写入成功
  ↓
标记 article.exportedAt
  ↓
删除该文章对应的 IndexedDB 大缓存
  ↓
标记 article.purgedAt
```

这样几万篇文章也不会全堆在 IndexedDB 里。
**删除逻辑**
以文章 URL 为主键清理：

```text
1. 找 article.link
2. 删除 html[url]
3. 删除 metadata[url]
4. 删除 comment[url]
5. 删除 comment_reply where url = article.link
6. 读取 resource-map[url]，拿到这篇文章用到的图片/CSS资源列表
7. 删除 resource-map[url]
8. 删除 resource 中这些资源
9. 更新 article：exportedAt / purgedAt
```

第 8 步要稍微谨慎：有些 CSS 或图片可能被多篇文章共用。稳妥做法是：
```text
只删除没有被其他未清理文章引用的 resource
```

如果嫌复杂，也可以先按 `fakeid` 清理公众号维度资源，但粒度会粗一点。
**手动按钮**
再加一个按钮：

```text
清理已导出缓存
```
按钮逻辑：
```text
查找 exportedAt 有值且 purgedAt 为空的文章
逐篇执行缓存清理
显示：已清理 N 篇，预计释放 X MB
```
再加一个更激进的按钮可以叫：
```text
清理全部本地缓存
```

这个保留 `article` 元数据，删除所有正文、HTML、图片、评论缓存。

**导出设置**
建议增加一个开关，默认打开：
```text
导出成功后自动清理 IndexedDB 缓存
```
旁边提示：
```text
清理后如需重新导出，需要重新抓取文章内容。
```

**为什么这样能解决 C 盘问题**
现在 3000 篇占 10G，主要是因为 HTML、图片、CSS、评论等 Blob 都长期留在 IndexedDB。改成导出成功后立刻删除大缓存后，IndexedDB 里只剩文章列表和状态，体积会从 GB 级降到 MB 级。

**注意点**
IndexedDB 支持这种删除，Dexie 也支持。删除后浏览器配额会释放；磁盘文件有时不会瞬间肉眼变小，因为 Chrome/Edge 的底层存储可能延迟压缩，但大对象 Blob 删除后通常会逐步回收。最关键的是不会继续无限增长。

我的最终建议是分两步做：
1. 先做 `导出成功后自动清理缓存`，这是根治 C 盘爆掉的关键。
2. 再做 `清理已导出缓存` 按钮，用来处理你已经下载过的 3000 篇历史缓存。


# P7
如果我已经把部分文章导出，网页上也没看到有已导出的列。
“内容已下载”状态没有了，此时我再次点击抓取的时候，又得重新开始抓取？