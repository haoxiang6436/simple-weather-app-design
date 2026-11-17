<template>
  <div class="sd-veil" role="presentation" @click.self="emit('close')">
    <section ref="panelEl" class="sd" role="dialog" aria-modal="true" :aria-labelledby="titleId" tabindex="-1"
      @keydown.esc.stop.prevent="emit('close')" @keydown.tab="handleTabKey">

      <aside class="sd-nav">
        <StaggerTransition preset="settingsNav" :index="0">
          <div class="sd-nav-head">
            <span class="sd-nav-kicker"><i class="sd-dash"></i>设置</span>
          </div>
        </StaggerTransition>

        <nav ref="navList" class="sd-nav-list" aria-label="设置分区">
          <div v-for="group in MENU" :key="group.title" class="sd-nav-group" :data-group="group.title">
            <StaggerTransition preset="settingsNav" :index="navOrder.titles[group.title]">
              <p class="sd-nav-group-title">{{ group.title }}</p>
            </StaggerTransition>

            <!-- 选中滑块挂在这一组里：同一组换项时它滑过去；换到别的组时，旧滑块原地淡出。
                 新组里的那块直接落在对应项下面 —— 不会横穿整张菜单飞过去。 -->
            <span class="sd-nav-thumb" :class="{ 'is-shown': group.title === thumbGroup }" aria-hidden="true"
              :ref="(el) => registerThumb(group.title, el)"></span>

            <StaggerTransition v-for="item in group.items" :key="item.key" preset="settingsNav"
              :index="navOrder.items[item.key]">
              <button class="sd-nav-item" type="button" :class="{ 'is-active': item.key === current }"
                :title="item.label" :aria-current="item.key === current ? 'page' : undefined"
                @click="current = item.key">
                <span class="sd-nav-icon">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path :d="item.icon" /></svg>
                </span>
                <span class="sd-nav-label">{{ item.label }}</span>
                <!-- 检测没过时挂个感叹号：那是唯一值得点进去的一页 -->
                <span v-if="navBadge(item.key)" class="sd-nav-badge is-alert">{{ navBadge(item.key) }}</span>
              </button>
            </StaggerTransition>
          </div>
        </nav>

        <StaggerTransition preset="settingsNav" :index="navOrder.foot">
          <div class="sd-nav-foot">
            <span class="sd-nav-version" :title="BUILD_TITLE">v{{ APP_VERSION }}</span>
          </div>
        </StaggerTransition>
      </aside>

      <section class="sd-main">
        <StaggerTransition preset="settingsNav" :index="1">
          <header class="sd-main-head">
            <div class="sd-main-heading">
              <!-- 标题跟着分区一起换：和正文同一套 pane-swap，不再瞬间跳。 -->
              <Transition name="pane-swap" mode="out-in">
                <div :key="current">
                  <span class="sd-kicker"><i class="sd-dash"></i>{{ pane.kicker }}</span>
                  <h2 :id="titleId" class="sd-title">{{ pane.title }}</h2>
                  <p class="sd-sub">{{ pane.sub }}</p>
                </div>
              </Transition>
            </div>
            <button class="sd-close" type="button" @click="emit('close')">返回天气</button>
          </header>
        </StaggerTransition>

        <!-- 正文区不显示滚动条：尺寸够时它不该出现，真装不下就拖 / 滚轮 / 方向键滚，
             上下边缘用一层淡出提示「还有内容」（三档状态由 useSmoothScroll 的 onScroll 给）。
             滚动交给 BetterScroll（和预警 / 空气质量弹层同一套）：Wallpaper Engine 不转发
             滚轮，能拖才是那一页的主力交互。 -->
        <div ref="bodyEl" class="sd-body"
          :class="{ 'is-overflow': bodyOverflow, 'is-scrolled': bodyScrolled, 'is-at-end': bodyAtEnd }"
          @keydown="handleBodyKey">
          <!-- bs 的约定：wrapper 的第一个元素就是内容层，而且初始化时只记一次 ——
               分区切换用的是 <Transition>（新旧 .sd-pane 交替），所以内容层必须包在
               Transition 外面常驻，否则换页之后 bs 还按旧节点量高度。 -->
          <div class="sd-scroll">
            <Transition name="pane-swap" mode="out-in">
              <div :key="current" class="sd-pane">

                <!-- ============ 概览 ============ -->
                <template v-if="current === 'overview'">
                  <!-- 三块按「读数 → 在哪儿 → 用掉多少」排：
                       上排是整行的读数卡（六条键值两列铺开，本该六行的内容压到三行，
                       这一页就不用滚动了）；下排两张等宽卡，左边地图回答「这台机器现在在哪」，
                       右边本月用量回答「这个月花掉多少额度」。
                       以前右上那张「接下来」纯是入口导流 —— 「连接与密钥」在导航里直达、
                       「新手引导」在「关于」页，删掉之后这一页只剩事实，不再是菜单的复读。 -->
                  <StaggerTransition preset="settingsPane" :index="0">
                    <section class="sd-block">
                      <div class="sd-block-head">
                        <span class="sd-block-title">此刻</span>
                        <span class="sd-block-pill">只读</span>
                      </div>
                      <ul class="sd-kv sd-kv-cols">
                        <!-- 位置写成完整层级（省-市-区-街道-路）：这一行宽度够，写全才看得出
                             这个点具体落在哪；缺省 / 街道的老记录会自动退成有的那几段 -->
                        <li><span>位置</span><b :title="`${locationFullText}（${coordText}）`">{{ locationFullText }}</b></li>
                        <li><span>天气数据</span><b>和风天气 · {{ entryCount }} 组域名轮询</b></li>
                        <li><span>最近刷新</span><b>{{ refreshedText }}</b></li>
                        <!-- 密钥那一行：组数 + 这次检测的可用组数。检测没跑完时不写「0 组可用」，
                             否则「正在检测」会被读成「全挂了」 -->
                        <li :class="keyTone"><span>密钥</span><b>{{ keyText }}</b></li>
                        <li><span>路名服务</span><b>{{ amapFilled ? '高德密钥已填写' : '未填写（不影响使用）' }}</b></li>
                        <!-- 概览只留一行结论：状态卡本身留在「连接与密钥」，同一件事不在两页各占一块 -->
                        <li :class="connectionTone"><span>连接状态</span><b>{{ connectionText }}</b></li>
                      </ul>
                    </section>
                  </StaggerTransition>

                  <!-- is-even：两张卡高度对齐（地图吃掉剩余高度、用量卡的按钮落到卡底），
                       否则一高一矮会在卡片下沿留出一截台阶 -->
                  <div class="sd-cols is-even">
                    <StaggerTransition preset="settingsPane" :index="1">
                      <section class="sd-block">
                        <div class="sd-block-head">
                          <span class="sd-block-title">位置地图</span>
                          <span class="sd-block-pill">{{ coordText }}</span>
                        </div>
                        <LocationMapPreview class="sd-map" :center="mapCenter" :caption="locationText"
                          :label="locationText" :placeholder="'还没选位置（不会显示地图）'" />
                        <p v-if="!mapCenter" class="sd-note">位置决定取哪里的天气，先选一个再回来。</p>
                        <div class="sd-actions sd-actions-foot">
                          <button class="sd-btn ghost" type="button" @click="openLocationPanel">
                            {{ mapCenter ? '在地图上查看' : '去选一个位置' }}
                          </button>
                        </div>
                      </section>
                    </StaggerTransition>

                    <StaggerTransition preset="settingsPane" :index="2">
                      <section class="sd-block">
                        <div class="sd-block-head">
                          <span class="sd-block-title">本月请求</span>
                          <span class="sd-block-pill">本地统计</span>
                        </div>
                        <p class="sd-usage-value">{{ formatCount(stats.month.ok) }}<small>次计入额度</small></p>
                        <div class="sd-usage-bar"><span :style="{ width: quotaWidth }"></span></div>
                        <p class="sd-usage-meta">免费额度 {{ formatCount(stats.quota) }} 次／月 · {{ quotaText }}</p>
                        <p class="sd-usage-meta">今天 {{ formatCount(stats.today.ok) }} 次 · {{ failedPhrase }}</p>
                        <!-- 一条 24 小时的迷你柱：两张卡等高之后，这里原本是一大片空白。
                             放的全是同一天的真实计数（不是装饰），也顺带回答了「今天什么时候在跑」 -->
                        <div class="sd-bars sd-bars-mini" role="img" :aria-label="`近 24 小时每小时请求量：${peakText}`">
                          <span v-for="bar in hourBars" :key="bar.key" class="sd-bar"
                            :class="{ 'is-empty': !bar.total }" :title="bar.title">
                            <i :style="{ height: bar.height }"></i>
                          </span>
                        </div>
                        <div class="sd-actions sd-actions-foot">
                          <button class="sd-btn" type="button" @click="current = 'stats'">查看统计详情 →</button>
                        </div>
                      </section>
                    </StaggerTransition>
                  </div>
                </template>

                <!-- ============ 连接与密钥（连接状态 / 凭据明细 / 怎么改，合成一页） ============ -->
                <template v-else-if="current === 'connection'">
                  <StaggerTransition preset="settingsPane" :index="0">
                    <div class="sd-status" :class="'is-' + CredentialStatus.tone">
                      <span class="sd-status-icon" :class="{ 'is-spinning': CredentialStatus.tone === 'loading' }">{{
                        statusGlyph }}</span>
                      <div class="sd-status-text">
                        <p class="sd-status-title">{{ CredentialStatus.title }}</p>
                        <p class="sd-status-desc">{{ CredentialStatus.desc }}</p>
                      </div>
                      <!-- 检测按钮长在状态卡上：结果和触发它的动作在同一处，不用另一行按钮去指代这张卡 -->
                      <button class="sd-btn sd-status-action" type="button" :disabled="retryDisabled"
                        @click="runApiCheck">
                        {{ CheckStatus === 'checking' ? '检测中…' : '重新检测' }}
                      </button>
                    </div>
                  </StaggerTransition>

                  <StaggerTransition preset="settingsPane" :index="1">
                    <p class="sd-note">每组只发 1 次地址查询，几乎不占额度。</p>
                  </StaggerTransition>

                  <!-- 「看明细」和「改密钥」并排：两块都是短行 + 短步骤，竖着排只会白白拉长成一屏，
                       把这一页顶出滚动条。窄一点的窗口自动落回上下排（见 .sd-cols 的媒体查询）。 -->
                  <StaggerTransition preset="settingsPane" :index="2">
                    <div class="sd-cols">
                      <section class="sd-block">
                        <div class="sd-block-head">
                          <span class="sd-block-title">当前凭据</span>
                          <span class="sd-block-pill">{{ entryCount }} 组</span>
                        </div>
                        <p v-if="!credentialRows.length" class="sd-note">还没有读取到域名与密钥。</p>
                        <ul v-else class="sd-rows">
                          <li v-for="row in credentialRows" :key="row.host" class="sd-row">
                            <span class="sd-row-main" :title="row.host">{{ row.host }}</span>
                            <span class="sd-row-meta">
                              <span class="sd-row-key">{{ row.key }}</span>
                              <span class="sd-row-state" :class="'is-' + row.tone">{{ row.state }}</span>
                            </span>
                            <p v-if="row.detail" class="sd-row-detail">{{ row.detail }}</p>
                          </li>
                          <li class="sd-row">
                            <span class="sd-row-main">高德密钥（路名）</span>
                            <span class="sd-row-meta">
                              <span class="sd-row-key">{{ amapFilled ? '已填写' : '未填写' }}</span>
                              <span class="sd-row-state is-muted">{{ amapText }}</span>
                            </span>
                          </li>
                        </ul>
                        <p class="sd-card-note">域名与密钥只保存在本机、不会上传；多个用英文逗号分隔、按顺序一一配对。</p>
                      </section>
                      <section class="sd-block">
                        <div class="sd-block-head">
                          <span class="sd-block-title">改或补一把密钥</span>
                          <span class="sd-block-pill">3 步</span>
                        </div>
                        <ol class="sd-steps">
                          <li v-for="(step, index) in CHANGE_STEPS" :key="step.title">
                            <span class="sd-step-no">{{ index + 1 }}</span>
                            <div class="sd-step-body">
                              <p class="sd-step-title">{{ step.title }}</p>
                              <p class="sd-step-text">{{ step.text }}</p>
                            </div>
                          </li>
                        </ol>
                        <div class="sd-callout">
                          <p class="sd-note">改完「壁纸属性」面板里的输入框后，点一下输入框外的空白处让它生效。</p>
                          <p class="sd-text">还没申请过：在和风天气开发者控制台注册免费账号、创建「API KEY」凭据即可；每月 5 万次请求免费，这张壁纸大约只用掉一成。</p>
                          <div class="sd-actions">
                            <button class="sd-btn ghost" type="button" @click="showHelp = true">打开图文教程：怎么申请域名与密钥</button>
                          </div>
                        </div>
                      </section>
                    </div>
                  </StaggerTransition>
                </template>

                <!-- ============ 统计 ============ -->
                <template v-else-if="current === 'stats'">
                  <!-- 四张卡排成 2×2：上面一行是「用了多少」（本月额度 + 近 24 小时曲线），
                       下面一行是「花在哪儿」（按接口 / 按域名）。
                       数字全来自请求层的计数（api/requestStats.js），不是示例值；口径说明退到页脚一行，
                       因为它是脚注，不该占一块版面。 -->
                  <div class="sd-cols">
                    <StaggerTransition preset="settingsPane" :index="0">
                      <section class="sd-block">
                        <div class="sd-block-head">
                          <span class="sd-block-title">本月请求</span>
                          <!-- 以前的「本机计数」是自造词，一眼看不出「不是官方的数」；
                               「本地统计 · 仅供参考」两句话把这一页最容易被误会的地方钉在标题上 ——
                               读数旁边说清出处，比在卡底再补一段小字更近，也不撑高这张卡 -->
                          <span class="sd-block-pill">本地统计 · 仅供参考</span>
                        </div>
                        <p class="sd-usage-value">{{ formatCount(stats.month.ok) }}<small>次计入额度</small></p>
                        <div class="sd-usage-bar"><span :style="{ width: quotaWidth }"></span></div>
                        <p class="sd-usage-meta">免费额度 {{ formatCount(stats.quota) }} 次／月 · {{ quotaText }}</p>
                        <p class="sd-usage-meta">今天 {{ formatCount(stats.today.ok) }} 次 · {{ failedPhrase }}</p>
                      </section>
                    </StaggerTransition>

                    <StaggerTransition preset="settingsPane" :index="1">
                      <section class="sd-block">
                        <div class="sd-block-head">
                          <span class="sd-block-title">近 24 小时</span>
                          <span class="sd-block-pill">{{ peakText }}</span>
                        </div>
                        <div class="sd-bars" role="img" aria-label="近 24 小时每小时的请求量">
                          <span v-for="bar in hourBars" :key="bar.key" class="sd-bar"
                            :class="{ 'is-empty': !bar.total }" :title="bar.title">
                            <i :style="{ height: bar.height }"></i>
                          </span>
                        </div>
                        <div class="sd-bar-axis">
                          <span>{{ hourBars[0].label }}</span>
                          <span>现在</span>
                        </div>
                      </section>
                    </StaggerTransition>

                    <StaggerTransition preset="settingsPane" :index="2">
                      <section class="sd-block">
                        <div class="sd-block-head">
                          <span class="sd-block-title">按接口</span>
                          <span class="sd-block-pill">本月</span>
                        </div>
                        <ul v-if="apiRows.length" class="sd-shares">
                          <li v-for="row in apiRows" :key="row.key">
                            <span class="sd-share-label">{{ row.label }}</span>
                            <span class="sd-share-track"><i :style="{ width: row.width }"></i></span>
                            <span class="sd-share-value">{{ formatCount(row.value) }}</span>
                          </li>
                        </ul>
                        <p v-else class="sd-note">本月还没有计入额度的请求。</p>
                      </section>
                    </StaggerTransition>

                    <StaggerTransition preset="settingsPane" :index="3">
                      <section class="sd-block">
                        <div class="sd-block-head">
                          <span class="sd-block-title">按域名</span>
                          <span class="sd-block-pill">本月</span>
                        </div>
                        <ul v-if="hostRows.length" class="sd-shares">
                          <li v-for="row in hostRows" :key="row.key">
                            <span class="sd-share-label" :title="row.label">{{ row.short }}</span>
                            <span class="sd-share-track"><i :style="{ width: row.width }"></i></span>
                            <span class="sd-share-value">{{ formatCount(row.value) }}</span>
                          </li>
                        </ul>
                        <p v-else class="sd-note">还没有可归到域名的请求。</p>
                        <p class="sd-card-note">多组域名轮询时，这里看得出请求实际压在哪个域名（也就是哪个账号）上。</p>
                      </section>
                    </StaggerTransition>
                  </div>

                  <!-- 页脚三条口径：来源 / 重置 / 参考。
                       这一页最容易被读错的两处是「这个数是不是官方的」「额度什么时候重新算」，
                       所以拆成两条并列的小标签，而不是揉进一整段长句 ——
                       长句会被跳过去，而这两句话恰恰是这一页可信度的全部来源。
                       第三行补上边界：只数和风（高德地图 / 一言不算）、只数本机、以控制台为准。 -->
                  <dl class="sd-stats-foot">
                    <dt>来源</dt>
                    <dd>壁纸在本机自行计数，存在本机浏览器里（清掉站点数据就从零重算），不读和风官方接口，也不含其它设备；计数从{{ sinceText }}开始。</dd>
                    <dt>重置</dt>
                    <dd>和风按自然月计费，免费额度每月 1 日重新计算；本页的月计数也在 1 日归零，与官方是同一个月边界。</dd>
                    <dt>参考</dt>
                    <dd>只统计这台机器发往和风天气的请求（高德地图、一言不计），与官方数字可能有出入；账单和额度余量以控制台「数据统计」（24 小时 / 30 天 / 6 个月三档）为准。</dd>
                  </dl>
                </template>

                <!-- ============ 外观与背景 ============ -->
                <template v-else-if="current === 'appearance'">
                  <StaggerTransition preset="settingsPane" :index="0">
                    <section class="sd-block">
                      <div class="sd-block-head">
                        <span class="sd-block-title">当前外观</span>
                        <span class="sd-block-pill">只读</span>
                      </div>
                      <ul class="sd-kv">
                        <li v-for="row in appearanceRows" :key="row.label">
                          <span>{{ row.label }}</span><b>{{ row.value }}</b>
                        </li>
                      </ul>
                    </section>
                  </StaggerTransition>

                  <StaggerTransition preset="settingsPane" :index="1">
                    <p class="sd-note">这些和雨滴强度、沉浸式雨滴一样，都在「壁纸属性」面板里调整；纯色是跟随面板配色的底色，「自定义纯色」可以自己挑颜色，自定义背景图也在那里选择。</p>
                  </StaggerTransition>
                </template>

                <!-- ============ 关于 ============ -->
                <template v-else>
                  <!-- 版本与更新：回答「我这装的是哪一版、最近改了什么」。
                       版本号与构建日期全部来自构建时注入（见 src/config/version.js），
                       更新日志来自 src/config/changelog.js，两者都不在这里手写。 -->
                  <StaggerTransition preset="settingsPane" :index="0">
                    <section class="sd-block">
                      <div class="sd-block-head">
                        <span class="sd-block-title">版本与更新</span>
                        <span class="sd-block-pill">v{{ APP_VERSION }}</span>
                      </div>
                      <p class="sd-build" :title="BUILD_TITLE">
                        构建于 {{ BUILD_DATE || '未知日期' }}<template v-if="BUILD_COMMIT_SHORT"> · 提交
                          {{ BUILD_COMMIT_SHORT }}</template>
                      </p>

                      <ul class="sd-log">
                        <li v-for="entry in visibleChangelog" :key="entry.version">
                          <div class="sd-log-head">
                            <span class="sd-log-tag">v{{ entry.version }}</span>
                            <!-- 预览版标记：changelog 条目写了 preview: true 才出现，正式版删掉字段即消失 -->
                            <span v-if="entry.preview" class="sd-log-preview">预览</span>
                            <span class="sd-log-title">{{ entry.title }}</span>
                            <span class="sd-log-date">{{ entry.date }}</span>
                          </div>
                          <ul class="sd-log-items">
                            <li v-for="item in entry.items" :key="item">{{ item }}</li>
                          </ul>
                        </li>
                      </ul>

                      <p class="sd-note">
                        版本号按「主版本.功能.修复」递增<template v-if="hiddenChangelogCount">，更早的
                          {{ hiddenChangelogCount }} 个版本见创意工坊简介</template>。
                      </p>
                    </section>
                  </StaggerTransition>

                  <StaggerTransition preset="settingsPane" :index="1">
                    <section class="sd-block">
                      <div class="sd-block-head">
                        <span class="sd-block-title">开源仓库</span>
                      </div>
                      <button class="sd-repo" type="button" :title="'点击复制：' + FULL_REPO_URL" @click="copyRepo">
                        <span class="sd-repo-url">{{ REPO_URL }}</span>
                        <!-- 复制反馈：点完在按钮右端换成「已复制 / 复制失败」，2.5 秒后自己淡回「点击复制」 -->
                        <Transition name="repo-tip" mode="out-in">
                          <span :key="repoCopied === '' ? 'idle' : repoCopied === 'ok' ? 'ok' : 'fail'" class="sd-repo-tip"
                            :class="{ 'is-ok': repoCopied === 'ok', 'is-fail': repoCopied === 'fail' }" aria-live="polite">{{
                              repoCopied === 'ok' ? '已复制' : repoCopied === 'fail' ? '复制失败，请手动选中' : '点击复制' }}</span>
                        </Transition>
                      </button>
                      <p class="sd-text">源码都在这里，可以自己改配色、改版式；你填写的域名与密钥只保存在本机、不会上传；天气数据来自和风天气的公开接口，仅供参考。</p>
                    </section>
                  </StaggerTransition>

                  <StaggerTransition preset="settingsPane" :index="2">
                    <section class="sd-block">
                      <div class="sd-block-head">
                        <span class="sd-block-title">新手引导</span>
                      </div>
                      <p class="sd-text">忘了当初怎么配的？把引导重看一遍，两步就能回到天气。</p>
                      <div class="sd-actions">
                        <button class="sd-btn ghost" type="button" @click="reviewOnboarding">重新查看新手引导 →</button>
                      </div>
                    </section>
                  </StaggerTransition>

                  <StaggerTransition preset="settingsPane" :index="3">
                    <div class="sd-colophon">
                      <!-- 版本号已经在上面的卡片里，这里只留署名与免责声明 -->
                      <p class="sd-note">个人业余作品，无盈利 · Wallpaper Engine 壁纸 · 纯本地运行，不收集任何数据</p>
                      <p class="sd-legal">免责声明：本壁纸由个人开发者制作，非和风天气官方出品，与和风天气（QWeather）无隶属、合作或背书关系；「和风天气」等名称与标识归其所有者，此处仅用于说明数据来源。</p>
                    </div>
                  </StaggerTransition>
                </template>
              </div>
            </Transition>
          </div>
        </div>
      </section>
    </section>

    <!-- 图文教程叠在设置弹窗上面：它 Teleport 到 body，和这里的层级互不相干 -->
    <ApiHelpPanel :open="showHelp" @close="showHelp = false" />
  </div>
</template>

<script setup>
/* 设置弹窗：左侧菜单 + 右侧内容（天气卡右上角齿轮的落点）
 *
 * 和引导页刻意分开：引导页回答「第一次怎么配」，这一页回答「现在什么状态、去哪儿改」。
 * 域名与密钥的写入口只在壁纸属性面板（引擎侧）和调试悬浮块（浏览器侧），
 * 所以这一页没有任何输入框，只做状态展示、重新检测与修改指引。
 *
 * 分区怎么切：连接状态 / 凭据明细 / 怎么改密钥是同一件事，所以并成「连接与密钥」一页
 * （检测结果在顶、明细在中、修改步骤在下）；「检测通过」这张卡也只在这一页出现一次，
 * 概览里退化成 kv 里的一行绿字，不重复占块。
 *
 * 概览只留三块事实：此刻（读数，其中「密钥」一行给组数与可用组数）、位置地图
 * （只读缩略图，改位置跳到地址页）、本月请求（用量摘要，明细在「统计」页）。
 * 入口型的卡片（以前的「接下来」）不放这一页：导航里每一项都是直达的。
 *
 * 动效分三层，全部走仓库现成的机制，不自造 keyframes：
 *   1. 弹层进出场 —— 外层 <transition name="Dialog">（见 App.vue，和预警 / 空气质量弹层同一套）。
 *      遮罩的淡入淡出在 style/transitions.scss 的 .Dialog-*，面板的位移 / 缩放 / 去模糊
 *      在本文件下方，参数照着 WeatherDialog.vue 抄，手感完全一致。
 *   2. 内部错峰 —— StaggerTransition + shared/motion/stagger.js 的 settingsNav / settingsPane
 *      两个预设：菜单逐行亮起，正文再晚半拍按阅读顺序展开；换分区只重播正文那一档。
 *   3. 选中高亮 —— 一块会滑动的玻璃滑块（.sd-nav-thumb）。它挂在「组」里，位置由量出来的
 *      offsetTop / offsetHeight 决定：同组换项时用 anime.js 的弹簧弹过去（SPRING_PRESETS.navThumb，
 *      和七日预报的选中块同一套手感），换组时旧滑块原地淡出、新组那块直接落位。
 *
 * 数据全部现取：检测状态与凭据来自 onboardingState / api/credentials，位置与刷新时间来自
 * 天气 store，外观四项来自壁纸属性。这里不存任何「看起来像真的」的示例值。
 *
 * ⚠️ 说明留在 script 里，别挪回 <template> 顶层：模板顶层注释在 dev 下是真实注释节点，
 *    根节点会变成「注释 + div」Fragment，外面 <Transition> 就丢掉离场动效。
 *    详见 AirQualityDialog.vue 的组件注释。 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { animate, spring } from 'animejs'
import StaggerTransition from '@/shared/motion/StaggerTransition'
import { SPRING_PRESETS } from '@/shared/motion/stagger'
import { PROJECT_REPO_URL, copyTextToClipboard } from '@/shared/clipboard'
import { useWeatherStore } from '@/store/index'
import { AmapKey, UserApiEntries } from '@/api/credentials'
import {
  REQUEST_API_LABELS,
  RequestStatsVersion,
  readRequestStats,
} from '@/api/requestStats'
import { BackgroundIndex, PanelScale, RainEnabled } from '@/features/wallpaper/properties'
import { BACKGROUND_INDEX_LABELS, isSolidBackgroundIndex } from '@/features/wallpaper/constants'
import { CustomBackgroundFileName } from '@/features/wallpaper/customBackground'
import LocationMapPreview from '@/features/weather/LocationMapPreview.vue'
import { formatLatLng, toMapCoord } from '@/features/weather/mapTiles'
import { openLocationPicker } from '@/features/weather/locationPanelState'
import { useSmoothScroll } from '@/features/weather/useSmoothScroll'
import ApiHelpPanel from './ApiHelpPanel.vue'
import {
  CheckResults,
  CheckStatus,
  CredentialStatus,
  maskKey,
  openOnboarding,
  runApiCheck,
} from './onboardingState'
import { APP_VERSION, BUILD_COMMIT_SHORT, BUILD_DATE, BUILD_TITLE } from '@/config/version'
import { CHANGELOG, CHANGELOG_VISIBLE } from '@/config/changelog'
import { CHANGE_STEPS, MENU, PANES, REPO_URL } from './settingsMenu'

// eslint-disable-next-line no-undef
const props = defineProps({
  /* 打开时停在哪个分区：正式打开一律从「概览」进，dev 预览页用它直接看某一页 */
  start: { type: String, default: 'overview' },
})
// eslint-disable-next-line no-undef
const emit = defineEmits(['close'])

const titleId = useId()
// start 传了不存在的 key 时退回概览，否则会落到最后那个 v-else 分支（关于）上
const current = ref(PANES[props.start] ? props.start : 'overview')
const showHelp = ref(false)

const pane = computed(() => PANES[current.value] || PANES.overview)

/* 更新日志只展示最近几版：列表在 src/config/changelog.js 里维护，
   卡片不折叠也不展开 —— 这一页本来就短，多一次点击反而挡路。 */
const visibleChangelog = CHANGELOG.slice(0, CHANGELOG_VISIBLE)
const hiddenChangelogCount = CHANGELOG.length - visibleChangelog.length

/* ---------- 菜单的错峰顺序 ----------
   每个分组标题也算一格，菜单项按阅读顺序往后排，导轨底部的版本行接在最后。
   这样「第几个亮」永远是渲染顺序，不用在模板里手数。 */
const navOrder = computed(() => {
  const titles = {}
  const items = {}
  let order = 0
  MENU.forEach((group) => {
    titles[group.title] = order
    order += 1
    group.items.forEach((item) => {
      items[item.key] = order
      order += 1
    })
  })
  return { titles, items, foot: order }
})

// 检测没过时给「连接与密钥」挂一个感叹号（其余项不挂：当前还没有别的东西会告警）
const navBadge = (key) => (key === 'connection' && CheckStatus.value === 'error' ? '!' : '')

/* ---------- 选中滑块 ----------
   每个分组各有一块 .sd-nav-thumb，只有当前分区所在那一组显示。
   位置不写死在 CSS 里：量当前项相对「组」的 offsetTop / offsetHeight；
   换字号、切分区都会重量一遍，滑块永远贴着真实的行高。

   位移走 anime.js 的 spring（和七日预报的滑动块同一套，参数见 SPRING_PRESETS.navThumb）：
   同一组里换项时，块从当前行弹到目标行 —— 起跳速度为零、稍微越过一点点再贴住；
   换组时还是老规矩：旧块原地淡出，新组那块直接落在对应项下面，
   不让一块玻璃横穿整张菜单（中间隔着分组标题，飞过去会盖住「数据」「其他」）。

   所以这里只有「组内移动」会弹，而且 -- 它推的是量出来的像素（y / height），
   不像七日预报那样能把「列号 → 位置」全交给 CSS：这一列的行高由文字撑开，
   CSS 算不出来，只能量。量一次的结果同时给三处用：快照、弹簧起点、弹簧终点。 */
const navList = ref(null)
const panelEl = ref(null)
const thumbGroup = ref('')
const thumbEls = new Map()

const registerThumb = (title, el) => {
  if (el) thumbEls.set(title, el)
  else thumbEls.delete(title)
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// 弹簧实例挂在元素上：同一块正在弹的时候再点一次，先 cancel 让它停在当前像素，
// 新弹簧从这里接着推（不然会从旧目标重新起跳，看着像弹了两下）
const thumbAnims = new WeakMap()

const snapThumb = (el, top, height) => {
  thumbAnims.get(el)?.cancel()
  thumbAnims.delete(el)
  el.style.transform = `translateY(${top}px)`
  el.style.height = `${height}px`
}

const playThumb = (el, top, height) => {
  thumbAnims.get(el)?.cancel()
  thumbAnims.set(el, animate(el, {
    y: top,
    height,
    ease: spring(SPRING_PRESETS.navThumb),
    onComplete: () => thumbAnims.delete(el),
  }))
}

/* 量一次并落位。snap = 不弹：首次出现（含换组后新组那块）、窗口缩放、
   系统开了「减少动态效果」—— 这些时候块本来就该直接在那儿。 */
const measureThumb = (snap = false) => {
  const item = navList.value?.querySelector('.sd-nav-item.is-active')
  const group = item?.closest('.sd-nav-group')
  if (!item || !group) return
  const title = group.dataset.group || ''
  const el = thumbEls.get(title)
  if (!el) return
  const top = item.offsetTop
  const height = item.offsetHeight
  // 换组时这块是「刚显示出来」的：旧位置属于上一组，滑过来没有意义，直接落位
  const isNewlyShown = thumbGroup.value !== title
  thumbGroup.value = title
  if (snap || isNewlyShown || prefersReducedMotion()) snapThumb(el, top, height)
  else playThumb(el, top, height)
}

/* ---------- 正文的滚动 ----------
   正文区刻意不画滚动条：尺寸够的时候它根本不该出现，真装不下就拖 / 滚轮 / 方向键滚。
   滚动本身交给共享的 useSmoothScroll（和预警 / 空气质量弹层同一套 BetterScroll）：
   这一页原本用原生 overflow-y:auto，只能滚轮 / 触控板 / 方向键 —— 而 Wallpaper Engine
   不转发滚轮事件，那一页就彻底滚不动了，拖拽才是主力交互。
   这里不绑自绘滚动条，仍然只用上下边缘的淡出当「还有内容」的提示。 */
const bodyOverflow = ref(false)
const bodyScrolled = ref(false)
const bodyAtEnd = ref(false)

/* 三档状态由 bs 在 scroll / scrollEnd / 重量尺寸之后算好递进来，这里只负责亮灭 UI */
const onBodyScroll = ({ overflow, atStart, atEnd }) => {
  bodyOverflow.value = overflow
  bodyScrolled.value = !atStart
  bodyAtEnd.value = atEnd
}

const {
  wrapperEl: bodyEl,
  start: startBodyScroll,
  stop: stopBodyScroll,
  refresh: refreshBodyScroll,
  scrollBy: scrollBodyBy,
  scrollToTop,
} = useSmoothScroll({ onScroll: onBodyScroll })

/* 换分区：新的一页从顶上开始读，不继承上一页滚到一半的位置。
   高度要等旧块离场（140ms）+ 新块进场之后才定，所以再补一次 refresh，
   否则 bs 的滚动范围停在上一页的高度上，拖到底也滚不到最后一行。 */
let bodyTimer = null
watch(current, () => {
  scrollToTop()
  nextTick(measureThumb)
  clearTimeout(bodyTimer)
  bodyTimer = setTimeout(refreshBodyScroll, 320)
})

/* 原生滚动时方向键 / PageUp / PageDown / Home / End 能滚正文，换成 bs 之后这些键不会
   自己动了，所以在 wrapper 上补回来（焦点落在正文里的按钮上时一样有效）。
   空格不接：它要留给按钮自己触发。 */
const handleBodyKey = (event) => {
  const el = bodyEl.value
  if (!el || event.altKey || event.ctrlKey || event.metaKey) return
  const page = Math.max(el.clientHeight * 0.85, 120)
  const delta = {
    ArrowDown: 64,
    ArrowUp: -64,
    PageDown: page,
    PageUp: -page,
    Home: -Infinity,
    End: Infinity,
  }[event.key]
  if (delta === undefined) return
  event.preventDefault()
  scrollBodyBy(delta, Math.abs(delta) > 100 ? 220 : 140)
}

/* ---------- 真实状态 → 文案 ---------- */
const entries = UserApiEntries

const weatherStore = useWeatherStore()
const {
  CityAddressFullLabel,
  CityAddressLabel,
  CityAddressPoint,
  TheWeatherDataIsLoaded,
  WeatherDataUpdatedAtATimeComputed,
} = storeToRefs(weatherStore)

const entryCount = computed(() => entries.value.length)
const amapFilled = computed(() => !!String(AmapKey.value || '').trim())
const amapText = computed(() => (amapFilled.value ? '选点显示路名' : '不影响使用'))

// 重新检测：检测中或没有可检测的凭据时按钮不可点（没有凭据时这一页本来也进不来，兜一层）
const retryDisabled = computed(() => CheckStatus.value === 'checking' || !entries.value.length)

const statusGlyph = computed(
  () => ({ wait: '…', loading: '↻', ok: '✓', warn: '!', error: '×' }[CredentialStatus.value.tone] || '…')
)

/* 位置两套写法，各用在该用的地方：
 *   完整地址（省-市-区-街道-路）给「此刻」卡的那一行 —— 这里宽度够，层级写全才看得出
 *   这个点具体落在哪；
 *   短名（区县 + 路名）给地图卡上的小标签 —— 那是贴在 2.5 公里视野上的地名，
 *   再带上省名，标签只会被截断成「浙江省-台州市-黄岩区…」，反而看不出位置。 */
const locationFullText = computed(() => CityAddressFullLabel.value || '还没选择位置')
const locationText = computed(() => CityAddressLabel.value || '还没选择位置')

// 最近刷新：和状态角标读同一份时间戳，没取到数据时直说，不显示「0 分钟前」
const refreshedText = computed(() => {
  if (!TheWeatherDataIsLoaded.value) return '还没取到数据'
  const minutes = Number(WeatherDataUpdatedAtATimeComputed.value)
  if (!Number.isFinite(minutes) || minutes <= 0) return '刚刚'
  return `${minutes} 分钟前`
})

/* ---------- 位置地图 ----------
 * 读数卡回答「是什么」，这张卡回答「在哪儿」：把当前使用的坐标摆成一张静态缩略图。
 * 坐标取自 store 的 CityAddressPoint —— 和取天气、反查地址用的是同一个点
 * （地图点选优先，其次是所选区县的中心），所以 pin 落在哪，天气就是哪里的。
 * 高德瓦片本身就是 GCJ-02，和落库坐标重合；toMapCoord 是为将来换 WGS-84 底图留的。 */
const mapCenter = computed(() => {
  const point = CityAddressPoint.value
  if (!point) return null
  const lng = Number(point.lng)
  const lat = Number(point.lat)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  return toMapCoord(lng, lat)
})

// 卡头那枚小标签：坐标比地址更能说明「这个点具体在哪」，也不和「此刻」卡里的位置行重复
const coordText = computed(() => {
  const center = mapCenter.value
  if (!center) return '未选位置'
  return formatLatLng(center[1], center[0])
})

/* 跳地址页：先关设置页，等「设置页一开就收掉地址页」的那个 watcher 跑完，
   再打开地址页 —— 顺序反过来的话，地址页会被那一跳顺手关掉（WeatherMain 里的 watch）。 */
const openLocationPanel = async () => {
  emit('close')
  await nextTick()
  openLocationPicker()
}

// 密钥那一行：组数 + 这次检测的可用组数。检测没跑完时不写「0/3 组可用」，
// 否则「正在检测」会被读成「全都挂了」；只有「全部可用 / 全都不可用」才染色，
// 部分可用本身就是需要人处理的状态，不用颜色替代那句话。
const passedCount = computed(() => CheckResults.value.filter((item) => item.ok).length)

const keyText = computed(() => {
  const groups = entryCount.value
  if (!groups) return '还没读到域名与密钥'
  const tone = CredentialStatus.value.tone
  if (tone === 'warn') return `${groups} 组 · 填写有误`
  if (tone === 'wait') return `${groups} 组 · 等待检测`
  if (tone === 'loading') return `${groups} 组 · 检测中…`
  if (tone === 'error') return `${groups} 组 · ${passedCount.value}/${groups} 组可用`
  // 「凭据未变 → 检测通过」这条捷径不产生逐组结果，此时只说结论，不编一个 0/3
  if (!CheckResults.value.length) return `${groups} 组 · 已验证可用`
  return passedCount.value === groups
    ? `${groups} 组 · 全部可用`
    : `${groups} 组 · ${passedCount.value}/${groups} 组可用`
})

const keyTone = computed(() => {
  if (!entryCount.value) return ''
  const tone = CredentialStatus.value.tone
  if (tone === 'error') return 'is-bad'
  if (tone === 'ok' && CheckResults.value.length && passedCount.value === entryCount.value) return 'is-ok'
  return ''
})

// 概览里那一行结论只说「检测到了什么状态」：几组可用已经是上面「密钥」那行的事，
// 同一句话不在同一张卡里说两遍
const connectionText = computed(() => CredentialStatus.value.title)

const connectionTone = computed(() => {
  const tone = CredentialStatus.value.tone
  return tone === 'ok' ? 'is-ok' : tone === 'error' ? 'is-bad' : ''
})

// 每组凭据的状态：优先用本次检测的逐组结果，其次看整体检测状态。
// 只有一组时，失败原因已经写在状态卡里，这一行只作「域名 + 打码密钥 + 可用/不可用」；
// 多组时才在行下补各自的原因，避免同一个错误说两遍。
const resultByHost = computed(() => {
  const map = new Map()
  CheckResults.value.forEach((item) => map.set(item.host, item))
  return map
})

const credentialRows = computed(() =>
  entries.value.map(({ host, key }) => {
    const result = resultByHost.value.get(host)
    if (result) {
      return {
        host,
        key: maskKey(key),
        tone: result.ok ? 'ok' : 'bad',
        state: result.ok ? '可用' : '不可用',
        // 只有一组时，失败原因已经写在状态卡里，逐组再重复一遍反而啰嗦
        detail: result.ok || CheckResults.value.length < 2 ? '' : result.message || '检测未通过',
      }
    }
    const tone = { checking: 'wait', ok: 'ok', error: 'bad' }[CheckStatus.value] || 'wait'
    const state = { checking: '检测中…', ok: '已通过', error: '未通过' }[CheckStatus.value] || '等待检测'
    return { host, key: maskKey(key), tone, state, detail: '' }
  })
)

// 外观与背景是壁纸属性，这一页只读不写：让用户知道「为什么面板这么小 / 背景怎么换」
const appearanceRows = computed(() => [
  { label: '面板缩放', value: `${Math.round(Number(PanelScale.value) * 100)}%` },
  { label: '背景', value: BACKGROUND_INDEX_LABELS[String(BackgroundIndex.value)] || '未知' },
  { label: '自定义背景', value: CustomBackgroundFileName.value || '未选择' },
  {
    label: '实时渲染雨滴',
    value: isSolidBackgroundIndex(BackgroundIndex.value) ? '不适用（纯色背景）' : RainEnabled.value ? '开启' : '关闭',
  },
])

/* ---------- 统计：读数全部来自请求层的计数 ----------
   计数在 api/requestStats.js 里累加（响应拦截器每完成一次请求记一笔），这里只读。
   那边的 state 刻意不是响应式对象：壁纸每分钟都在请求，为一页偶尔打开的面板让每次请求
   都过一遍 Proxy 不划算。于是改成「记一笔就版本号 +1」，下面这个 computed 盯版本号重算。 */
const stats = computed(() => {
  const version = RequestStatsVersion.value
  return { ...readRequestStats(), version }
})

const countFormat = new Intl.NumberFormat('zh-CN')
const formatCount = (value) => countFormat.format(Math.max(0, Math.round(Number(value) || 0)))

// 免费额度的占用：0 次时条是空的；非 0 时给个最小宽度，否则 0.4% 在条上等于看不见
const quotaRatio = computed(() => {
  const quota = Number(stats.value.quota) || 1
  const used = Number(stats.value.month.ok) || 0
  return Math.min(1, used / quota)
})

const quotaWidth = computed(() => (stats.value.month.ok ? `${Math.max(1.5, quotaRatio.value * 100)}%` : '0%'))

const quotaText = computed(() => {
  const used = Number(stats.value.month.ok) || 0
  if (!used) return '本月还没开始用'
  const percent = quotaRatio.value * 100
  const percentText = percent < 10 ? percent.toFixed(1) : String(Math.round(percent))
  return `已用 ${percentText}% · 还剩 ${formatCount(Math.max(0, stats.value.quota - used))} 次`
})

// 没进额度的那些：非 2xx 和超时按官方规则都不计费（见 api/requestStats.js 的口径说明）。
// v7 的「HTTP 200 + 业务码失败」官方没说算不算一次请求，所以单独点名，不混进主数字。
const failedPhrase = computed(() => {
  const { soft, err, net } = stats.value.month
  const unused = soft + err + net
  if (!unused) return '本月没有失败'
  const tail = soft ? `（含业务失败 ${formatCount(soft)}）` : ''
  return `本月失败 ${formatCount(unused)} 次，不计费${tail}`
})

/* 开始计数的那一天：只说日期，不显示「已经记了 3 天」—— 跨零点还得跟着重算，收益不大。
   三种口径：没有记录 →「现在」，当天 → 「今天」，更早 → 「11月14日」。
   它不是写死的字：跟着计数里的 firstAt 走，而 stats 每记一笔就重算一次
   （壁纸大约每分钟一次请求），所以过了零点不会一直挂着「今天」。 */
const sinceText = computed(() => {
  const firstAt = Number(stats.value.firstAt)
  if (!firstAt) return '现在'
  const first = new Date(firstAt)
  if (first.toDateString() === new Date().toDateString()) return '今天'
  return `${first.getMonth() + 1}月${first.getDate()}日`
})

// 近 24 小时：高度按窗口内最高的一小时归一，空小时留一根 2px 的浅色矮柱，
// 这样「哪些小时一个请求都没有」也看得出来（壁纸被暂停 / 电脑关机）
const hourBars = computed(() => {
  const list = stats.value.hours
  const peak = list.reduce((max, item) => Math.max(max, item.total), 0)
  const scale = peak || 1
  return list.map((item) => ({
    key: item.key,
    label: item.label,
    total: item.total,
    height: `${Math.round((item.total / scale) * 100)}%`,
    title: `${item.label} · ${formatCount(item.total)} 次`,
  }))
})

const peakText = computed(() => {
  const peak = hourBars.value.reduce((max, bar) => Math.max(max, bar.total), 0)
  return peak ? `最多 ${formatCount(peak)} 次/时` : '还没有请求'
})

/* 占比条：宽度至少 1%，否则 0.3% 的那一项会彻底消失（数字仍然在右边，不算撒谎）。
   最多列 6 行，剩下的并成「其他 N 项」—— 面板高度就这么多，与其让列表把这一页顶出滚动条，
   不如把长尾收起来：这一栏要看的是「谁最费额度」，不是完整清单。 */
const SHARE_ROW_LIMIT = 6
const toShareRow = (row, label, short) => ({
  key: row.key,
  label,
  short: short || label,
  value: row.value,
  width: `${Math.max(1, Math.round(row.share * 100))}%`,
})

const apiRows = computed(() => {
  const rows = stats.value.apis
  const list = rows.slice(0, SHARE_ROW_LIMIT).map((row) => toShareRow(row, REQUEST_API_LABELS[row.key] || row.key))
  const rest = rows.slice(SHARE_ROW_LIMIT)
  if (rest.length) {
    const value = rest.reduce((sum, row) => sum + row.value, 0)
    const share = rest.reduce((sum, row) => sum + row.share, 0)
    list.push(toShareRow({ key: '__rest__', value, share }, `其他 ${rest.length} 项`))
  }
  return list
})

/* 域名只显示最前面那截：完整 host 是 abcd1234.re.qweatherapi.com 这种，一行放不下，
   而「abcd1234.re.qweatherapi.com」被截断后每行长得都一样，等于没写。
   去掉公共后缀反而最好认，完整值放在 title 里。 */
const stripHostSuffix = (host) =>
  String(host)
    .replace(/\.re\.qweatherapi\.com$/i, '')
    .replace(/\.qweatherapi\.com$/i, '')

const hostRows = computed(() =>
  stats.value.hosts
    .slice(0, SHARE_ROW_LIMIT)
    .map((row) => toShareRow(row, row.key, stripHostSuffix(row.key) || row.key))
)

/* ---------- 仓库地址：点一下复制完整地址（带协议），2.5 秒后提示自动收回 ---------- */
/* 复制本身走 shared/clipboard：CEF 里 navigator.clipboard 不一定可用，那里有 textarea 兜底 */
const FULL_REPO_URL = PROJECT_REPO_URL
const repoCopied = ref('')
let repoTimer = null
const copyRepo = async () => {
  const ok = await copyTextToClipboard(FULL_REPO_URL)
  repoCopied.value = ok ? 'ok' : 'fail'
  clearTimeout(repoTimer)
  repoTimer = setTimeout(() => {
    repoCopied.value = ''
  }, 2500)
}

/* ---------- 主动回顾引导：先关设置页，再让引导页接手 ----------
   引导页的优先级高于设置页（见 WeatherMain 的 panelView），但两页同时挂着的话，
   引导页会落在设置弹窗背后 —— 用户点完按钮什么也看不见。 */
const reviewOnboarding = () => {
  emit('close')
  openOnboarding({ review: true })
}

/* ---------- 键盘：Tab 在面板内循环，和 WeatherDialog 的处理一致 ---------- */
const handleTabKey = (event) => {
  const panel = panelEl.value
  if (!panel) return
  const controls = [...panel.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
    .filter((element) => element.getClientRects().length)
  const first = controls[0]
  const last = controls[controls.length - 1]
  if (!controls.length) {
    event.preventDefault()
    panel.focus()
    return
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last?.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first?.focus()
  }
}

/* ---------- 焦点 / 关闭：和 WeatherDialog 一样，进来自动聚焦面板（Esc 才有用），
   出去把焦点还给打开它的那颗齿轮 ---------- */
let previousFocus = null
let navObserver = null

onMounted(() => {
  previousFocus = document.activeElement
  panelEl.value?.focus({ preventScroll: true })
  // 等正文渲染完再建 bs 实例：它在初始化时量一次 wrapper / 内容尺寸
  nextTick(() => {
    startBodyScroll()
    measureThumb(true)
  })
  if (typeof ResizeObserver === 'undefined') return
  // 导轨宽度会随窗口变 —— 重量一遍（尺寸变了直接落位，不弹）。
  // 正文的高度变化由 useSmoothScroll 自己的 ResizeObserver 管，这里不用再挂一个。
  if (navList.value) {
    navObserver = new ResizeObserver(() => measureThumb(true))
    navObserver.observe(navList.value)
  }
})

onBeforeUnmount(() => {
  clearTimeout(bodyTimer)
  clearTimeout(repoTimer)
  navObserver?.disconnect()
  stopBodyScroll()
  // 弹层关掉时正在弹的那块已经不在了，顺手把动画掐掉，别让 rAF 追着一个脱离文档的节点跑
  thumbEls.forEach((el) => thumbAnims.get(el)?.cancel())
  thumbEls.clear()
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
})
</script>

<style lang="scss" scoped>
/* ================= 遮罩层 =================
   和 WeatherDialog 完全同一套：铺满视口的 --scrim + 一层背景模糊。
   整层的淡入淡出交给全局 .Dialog-*（style/transitions.scss），
   面板自己的位移 / 缩放 / 去模糊写在下面几行 —— 设置弹窗进出场和预警、
   空气质量、分钟级降水那几个弹层是同一个手感。
   层级同样是 60：图文教程（ApiHelpPanel）也 Teleport 到 body、同用 60，
   它在 DOM 里排在 #app 之后，所以永远压在这层上面。 */
.sd-veil {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  background-color: var(--scrim);
  -webkit-backdrop-filter: blur(1.125rem);
  backdrop-filter: blur(1.125rem);
}

/* 面板进出场：进场慢（0.48s 一路减速停住）、离场快（0.34s 越走越快）。
   离场总时长必须和遮罩一致 —— Vue 按根元素的过渡结束时间摘整棵子树，
   遮罩先结束的话，面板这段位移会被砍掉最后一截。 */
.sd-veil.Dialog-enter-active .sd {
  transition: transform 0.48s var(--ease-enter), opacity 0.36s ease, filter 0.48s ease;
}

.sd-veil.Dialog-leave-active .sd {
  transition: transform 0.34s var(--ease-leave), opacity 0.26s var(--ease-leave), filter 0.3s var(--ease-leave);
}

/* 只位移不缩放：缩放会在收尾重栅格时让面板里的文字和边框跳一下（理由见 WeatherDialog.vue）。 */
.sd-veil.Dialog-enter-from .sd {
  opacity: 0;
  transform: translateY(-1.75rem);
  filter: blur(3px);
}

.sd-veil.Dialog-leave-to .sd {
  opacity: 0;
  transform: translateY(0.75rem);
  filter: blur(2px);
}

/* ================= 外壳 =================
   和 WeatherDialog（预警 / 天气弹层）同一套材质：深蓝玻璃 + 细边 + 大圆角 + 一道内高光，
   只是这里不是 1.618 比例，而是「左导轨固定宽 + 右内容自适应」。 */
.sd {
  --sd-nav-w: 12.75rem;

  display: grid;
  grid-template-columns: var(--sd-nav-w) minmax(0, 1fr);
  width: min(96%, 64rem);
  /* 高度：窗口矮时拔到 92vh，宽屏也就到 44rem —— 再高这一页就空得发慌了 */
  --sd-h-default: min(88vh, 44rem);
  height: var(--sd-h, var(--sd-h-default));
  overflow: hidden;
  font-family: var(--font-sans);
  color: var(--text-primary);
  background: var(--weather-dialog-bg);
  border: 1px solid var(--glass-border);
  border-radius: 1.375rem;
  box-shadow:
    0 1.75rem 4.375rem -1.75rem rgba(0, 0, 0, 0.7),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(140%);
  backdrop-filter: blur(var(--glass-blur)) saturate(140%);
}

/* 面板本身只是接收焦点的容器，不要焦点框 */
.sd:focus {
  outline: none;
}

/* ================= 左导轨 ================= */
.sd-nav {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
  padding: 1.25rem 0.75rem 0.875rem;
  /* 导轨压暗一点，让「列」的感觉更清楚 */
  background: linear-gradient(180deg, var(--glass-bg-soft), transparent 78%);
  border-right: 1px solid var(--glass-border);
}

.sd-nav-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0 0.625rem;
}

/* 「— 设置」：沿用设置页 kicker 的短横线 + 小字，不另造一套标题样式 */
.sd-nav-kicker,
.sd-kicker {
  display: inline-flex;
  align-items: center;
  gap: 0.4375rem;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.sd-dash {
  display: block;
  width: 0.875rem;
  height: 1px;
  background: linear-gradient(90deg, rgba(125, 211, 252, 0.2), var(--color-primary));
}

.sd-nav-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  min-height: 0;
  overflow-y: auto;
  /* 菜单项多到装不下时也不画滚动条，滚轮照常能滚 */
  scrollbar-width: none;
  overscroll-behavior: contain;

  &::-webkit-scrollbar {
    width: 0;
    height: 0;
  }
}

.sd-nav-group {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.1875rem;
}

.sd-nav-group-title {
  margin: 0.375rem 0 0.25rem;
  padding: 0 0.625rem;
  font-size: 0.64rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: var(--text-muted);
}

/* 第二组起把标题推远一点：分组标题就是分组之间的那道呼吸 */
.sd-nav-group + .sd-nav-group .sd-nav-group-title {
  margin-top: 0.625rem;
}

/* 选中滑块：整块玻璃胶囊 + 左沿那道 2px 蓝竖线，位置由脚本量出来。
   同一组里换项时它靠 anime.js 的弹簧弹过去（translateY + height 逐帧写内联样式），
   换组时这块淡出、新组那块直接落位 —— 高亮始终在「它该在的那一组」里。
   ⚠️ transform / height 不要在这里挂 transition：脚本正在逐帧写这两个值，
   一边过渡一边写会互相拖，弹簧的过冲会被 CSS 抹平成滑块。 */
.sd-nav-thumb {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  z-index: 0;
  border-radius: 0.625rem;
  background: var(--glass-active);
  border: 1px solid var(--rain-chip-border);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
  opacity: 0;
  pointer-events: none;
  will-change: transform;
  /* 只有「换组」的显隐还走 CSS：淡入淡出和位移各管各的 */
  transition: opacity 0.16s ease;
}

.sd-nav-thumb.is-shown {
  opacity: 1;
}

/* 整页只有这一处蓝色，跟着滑块一起走，不单独挂在按钮上 */
.sd-nav-thumb::before {
  content: '';
  position: absolute;
  left: 0.1875rem;
  top: 50%;
  width: 2px;
  height: 0.9375rem;
  border-radius: 2px;
  background: var(--color-primary);
  translate: 0 -50%;
}

/* 菜单项：不加图标底、不加大色块。底色交给上面那块滑块，
   这一层只负责文字 / 图标的明暗和悬停时的极淡玻璃。 */
.sd-nav-item {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  padding: 0.5rem 0.625rem;
  font-size: 0.8rem;
  font-weight: 600;
  line-height: 1.35;
  text-align: left;
  color: var(--text-secondary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 0.625rem;
  transition: color 0.18s ease, background 0.18s ease, border-color 0.18s ease;

  &:hover:not(.is-active) {
    color: var(--text-primary);
    background: var(--glass-bg-soft);
  }

  &.is-active {
    color: var(--text-primary);
  }
}

.sd-nav-icon {
  flex: none;
  display: block;
  width: 1.0625rem;
  height: 1.0625rem;
  color: currentColor;
  opacity: 0.88;

  svg {
    display: block;
    width: 100%;
    height: 100%;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

.sd-nav-item.is-active .sd-nav-icon {
  color: var(--color-primary-soft);
  opacity: 1;
}

.sd-nav-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sd-nav-badge {
  flex: none;
  margin-left: auto;
  padding: 0.0625rem 0.375rem;
  font-size: 0.66rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
}

/* 告警角标：检测没过时才出现，用暖色而不是红色 —— 它只是「进去看看」，不是错误弹窗 */
.sd-nav-badge.is-alert {
  color: var(--warning-text);
  background: rgba(227, 163, 110, 0.14);
  border-color: rgba(227, 163, 110, 0.32);
}

.sd-nav-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-height: 1.75rem;
  padding: 0 0.625rem;
}

.sd-nav-version {
  font-size: 0.66rem;
  letter-spacing: 0.02em;
  color: var(--text-muted);
}

/* ================= 右内容 ================= */
.sd-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.sd-main-head {
  flex: none;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.375rem 1.75rem 0.75rem;
}

.sd-main-heading {
  min-width: 0;
}

.sd-kicker {
  color: var(--color-primary-soft);
}

.sd-title {
  margin: 0.375rem 0 0;
  font-size: 1.3rem;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: var(--text-primary);
}

.sd-sub {
  max-width: 54ch;
  margin: 0.3125rem 0 0;
  font-size: 0.78rem;
  line-height: 1.65;
  color: var(--text-muted);
  /* 中文换行不加 pretty 时，最后一行常常只剩两三个字（「写任何凭据。」那种） */
  text-wrap: pretty;
}

.sd-close {
  flex: none;
  padding: 0.4375rem 0.9375rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  transition: color 0.2s ease, background 0.2s ease, border-color 0.2s ease;

  &:hover {
    color: var(--text-primary);
    background: var(--glass-border);
    border-color: var(--glass-border-strong);
  }
}

.sd-body {
  flex: 1;
  min-height: 0;
  /* BetterScroll 的约定：wrapper 定高 + overflow:hidden，位移由 bs 写在内容层的 transform 上。
     正文里也不出现原生滚动条 —— 面板尺寸是按「刚好放下」定的，滚动条只是兜底。 */
  overflow: hidden;
  /* 上下边缘的淡出：只在真的溢出时出现（脚本里 is-overflow / is-scrolled / is-at-end），
     滚到底就收掉，等于用一层柔光代替滚动条当「还有内容」的提示 */
  --sd-fade-top: 0rem;
  --sd-fade-bottom: 0rem;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 var(--sd-fade-top),
      #000 calc(100% - var(--sd-fade-bottom)), transparent 100%);
  mask-image: linear-gradient(to bottom, transparent 0, #000 var(--sd-fade-top),
      #000 calc(100% - var(--sd-fade-bottom)), transparent 100%);

  &.is-overflow:not(.is-at-end) {
    --sd-fade-bottom: 1.75rem;
  }

  &.is-scrolled {
    --sd-fade-top: 1.5rem;
  }
}

/* 内容层（bs 只认 wrapper 的第一个元素）。内边距放在这一层而不是 wrapper 上：
   bs 按内容层的 offsetHeight 算滚动范围，内边距留在 wrapper 里时那截留白不会被算进去，
   拖到底就会少一截。 */
.sd-scroll {
  padding: 0.25rem 1.75rem 1.75rem;
}

.sd-pane {
  display: flex;
  flex-direction: column;
  gap: 1.125rem;
  max-width: 46rem;
}

/* 「看明细」和「改密钥」两栏：等宽并排。
   并排能把这一页压矮三分之一 —— 不出现滚动条最有效的办法是把内容排扁，而不是把条藏起来。
   align-items: start 让两张卡各按内容收高，不会为对齐硬撑出一片空地。 */
.sd-cols {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: start;
  gap: 1rem;
}

/* 分区之间的切换：只做一点点位移 + 淡入，不重播整个弹层。
   块与块的错峰由 settingsPane 预设接管（entering 从 240ms 起），
   两者不重叠，所以不会出现「容器淡一次、每块再淡一次」的叠影。 */
.pane-swap-enter-active {
  transition: opacity 0.22s var(--ease-enter), translate 0.22s var(--ease-enter);
}

.pane-swap-leave-active {
  transition: opacity 0.14s var(--ease-leave), translate 0.14s var(--ease-leave);
}

.pane-swap-enter-from {
  opacity: 0;
  translate: 0 0.5rem;
}

.pane-swap-leave-to {
  opacity: 0;
  translate: 0 -0.35rem;
}

/* ================= 状态卡 =================
   颜色全部由 --tone-* 给出，tone 来自 onboardingState 的 CredentialStatus：
   ok / error / warn / loading / wait 五档，和引导页那张 CredentialStatusCard 同一套色。 */
.sd-status {
  --tone-glyph: var(--text-secondary);
  --tone-wash: var(--glass-bg-soft);
  --tone-line: var(--glass-border);
  --tone-tint: transparent;

  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.625rem 0.75rem;
  padding: 0.875rem 1rem;
  background: linear-gradient(158deg, var(--tone-tint), transparent 62%), var(--glass-bg-soft);
  border: 1px solid var(--tone-line);
  border-radius: var(--radius-md);
}

.sd-status.is-ok {
  --tone-glyph: var(--success-text);
  --tone-wash: rgba(140, 200, 166, 0.12);
  --tone-line: rgba(140, 200, 166, 0.28);
  --tone-tint: rgba(140, 200, 166, 0.08);
}

.sd-status.is-error {
  --tone-glyph: var(--danger-text);
  --tone-wash: rgba(191, 95, 92, 0.12);
  --tone-line: rgba(191, 95, 92, 0.28);
  --tone-tint: rgba(191, 95, 92, 0.08);
}

.sd-status.is-warn {
  --tone-glyph: var(--warning-text);
  --tone-wash: rgba(227, 163, 110, 0.12);
  --tone-line: rgba(227, 163, 110, 0.28);
  --tone-tint: rgba(227, 163, 110, 0.08);
}

.sd-status.is-loading {
  --tone-glyph: var(--color-primary-soft);
  --tone-wash: var(--glass-active);
  --tone-line: var(--rain-chip-border);
  --tone-tint: var(--glass-active);
}

.sd-status-icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1;
  color: var(--tone-glyph);
  background: var(--tone-wash);
  border: 1px solid var(--tone-line);
  border-radius: 0.8125rem;

  &.is-spinning {
    animation: sd-spin 1.1s linear infinite;
  }
}

@keyframes sd-spin {
  to {
    transform: rotate(360deg);
  }
}

.sd-status-text {
  flex: 1 1 12rem;
  min-width: 0;
}

.sd-status-title {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--tone-glyph);
}

.sd-status-desc {
  margin: 0.1875rem 0 0;
  font-size: 0.78rem;
  line-height: 1.55;
  color: var(--text-secondary);
  /* 失败原因可能带换行（「主体 + 建议」多行），保留换行符 */
  white-space: pre-line;
}

/* 检测按钮长在卡的右端：换行时也跟着落到右侧，不会跑到卡外去 */
.sd-status-action {
  flex: none;
  margin-left: auto;
}

/* 紧跟状态卡的那行脚注属于卡本身，别按块间距拉开 */
.sd-status + .sd-note {
  margin-top: -0.6875rem;
}

/* ================= 分区块：每节一张玻璃卡 ================= */
.sd-block {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  padding: 0.875rem 1rem 0.9375rem;
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-sm);
}

.sd-block-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.sd-block-title {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.76rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text-secondary);
}

.sd-block-pill {
  flex: none;
  margin-left: auto;
  padding: 0.125rem 0.4375rem;
  font-size: 0.66rem;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
}

/* ================= 键值行 / 凭据行 ================= */
.sd-kv {
  display: flex;
  flex-direction: column;
  gap: 0.3125rem;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    font-size: 0.78rem;
    color: var(--text-muted);
  }

  b {
    font-weight: 600;
    color: var(--text-secondary);
  }

  /* 概览里那一行结论：只把值染色，不再放第二张状态卡 */
  li.is-ok b {
    color: var(--color-ok);
  }

  li.is-bad b {
    color: var(--warning-text);
  }
}

/* 整行宽的读数卡：六条键值排两列。
   一条一行时，整行宽度会让值离标签远到要用眼睛去找（「最近刷新」在最左、值在最右）；
   两列把行数从六压到三，这一页因此不用滚动，也顺带解决了「值离标签太远」。
   列间距比行间距大得多：两列之间要能一眼分出「这里是另一组」，行内只要贴住自己的标签。 */
.sd-kv-cols {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.375rem 2.25rem;
}

/* 两张等宽卡高度对齐：地图吃掉卡里剩下的高度，按钮落到卡底，
   否则一高一矮会在卡片下沿留出一截台阶。 */
.sd-cols.is-even {
  align-items: stretch;
}

/* 卡底那颗按钮：不管上面内容多长，都贴在卡的最后一行 */
.sd-actions-foot {
  margin-top: auto;
}

/* 地图缩略图在卡里撑满剩余高度（组件自己的最小高度见 LocationMapPreview.vue） */
.sd-map {
  flex: 1 1 auto;
}

/* ================= 统计 =================
   整页只有一个大数字（本月计入额度），其余都是它的注解。
   只给主色，不用 --color-warn / --color-danger：这一页不是告警页，
   把「失败」也染成红的，等于天天报一次警。 */
.sd-usage-value {
  display: flex;
  align-items: baseline;
  gap: 0.375rem;
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.15;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);

  small {
    font-size: 0.72rem;
    font-weight: 500;
    color: var(--text-muted);
  }
}

.sd-usage-bar {
  height: 0.3125rem;
  overflow: hidden;
  background: var(--surface-inset);
  border-radius: 999px;

  span {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, var(--color-primary-strong), var(--color-primary));
    border-radius: inherit;
    transition: width 0.4s var(--ease);
  }
}

.sd-usage-meta {
  margin: -0.125rem 0 0;
  font-size: 0.7rem;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
}

/* 统计页的页脚：三条口径（来源 / 重置 / 参考）。一条细线收在内容末尾，
   和「关于」页的 colophon 同一套写法 —— 它是脚注，不该单独占一张卡。
   排成「小标签 + 一句话」两列：标签列对齐，扫一眼就知道哪条讲来源、哪条讲重置；
   整段长句的写法（改版前）读起来是一团，而这两句正是这页要不要信的关键。 */
.sd-stats-foot {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: baseline;
  gap: 0.3125rem 0.5rem;
  margin: 0;
  padding-top: 0.625rem;
  border-top: 1px solid var(--glass-border);

  dt {
    font-size: 0.66rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  dd {
    margin: 0;
    font-size: 0.7rem;
    line-height: 1.65;
    color: var(--text-muted);
    text-wrap: pretty;
  }
}

/* 近 24 小时：24 根柱子等宽排开，靠高度说话 */
.sd-bars {
  display: flex;
  align-items: flex-end;
  gap: 0.1875rem;
  height: 3.25rem;
}

/* 概览里那条迷你柱：只占三行字的高度，没有坐标轴也没有标签 ——
   它是「今天在什么时候跑」的缩略图，明细留在统计页 */
.sd-bars-mini {
  height: 2.125rem;
  margin-top: 0.125rem;
}

.sd-bar {
  display: flex;
  flex: 1;
  align-items: flex-end;
  height: 100%;

  i {
    display: block;
    width: 100%;
    min-height: 2px;
    background: var(--color-primary);
    border-radius: 0.125rem 0.125rem 0 0;
    opacity: 0.75;
    transition: height 0.4s var(--ease);
  }

  /* 一个请求都没有的小时：留一根浅色矮柱，别让曲线出现看不见的断点 */
  &.is-empty i {
    background: var(--glass-border-strong);
    opacity: 0.6;
  }
}

.sd-bar-axis {
  display: flex;
  justify-content: space-between;
  font-size: 0.66rem;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
}

/* 占比行：名字 / 条 / 数字。名字给固定宽度，条才不会因为名字长短而参差 */
.sd-shares {
  display: flex;
  flex-direction: column;
  gap: 0.3125rem;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
}

.sd-share-label {
  flex: 0 1 5.25rem;
  min-width: 0;
  overflow: hidden;
  font-size: 0.7rem;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
}

.sd-share-track {
  flex: 1 1 auto;
  min-width: 1.5rem;
  height: 0.25rem;
  overflow: hidden;
  background: var(--surface-inset);
  border-radius: 999px;

  i {
    display: block;
    height: 100%;
    background: var(--color-primary);
    border-radius: inherit;
    opacity: 0.72;
  }
}

.sd-share-value {
  flex: none;
  font-size: 0.68rem;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
}

/* 卡里的小脚注（「只存本机 / 逗号配对」这类）：一道细线分开，不另起一张卡 */
.sd-card-note {
  margin: 0.125rem 0 0;
  padding-top: 0.625rem;
  font-size: 0.7rem;
  line-height: 1.6;
  color: var(--text-muted);
  text-wrap: pretty;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

/* 卡里的小尾巴（「还没申请过」这类补充说明）：一道细线隔开，不再另起一张卡 */
.sd-callout {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.125rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.sd-rows {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

/* 一行一条凭据：域名占一整行（它是辨识用的主角），掩码和状态退到第二行做注解。
   两栏并排时这一列只有 300 出头，挤在一行里域名必然被省略号截断 —— 那正好是用户要核对的东西。 */
.sd-row {
  display: flex;
  flex-direction: column;
  gap: 0.1875rem;

  & + & {
    padding-top: 0.5rem;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
}

.sd-row-meta {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.sd-row-main {
  min-width: 0;
  overflow: hidden;
  font-size: 0.78rem;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-secondary);
}

.sd-row-key {
  flex: none;
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--text-muted);
}

.sd-row-state {
  flex: none;
  font-size: 0.7rem;
  font-weight: 600;
  white-space: nowrap;

  &.is-ok {
    color: var(--color-ok);
  }

  &.is-bad {
    color: var(--warning-text);
  }

  &.is-wait,
  &.is-muted {
    color: var(--text-muted);
  }
}

/* 多组时每行下面的失败原因 */
.sd-row-detail {
  margin: 0.1875rem 0 0;
  font-size: 0.7rem;
  line-height: 1.5;
  color: var(--warning-text);
}

/* ================= 步骤 ================= */
.sd-steps {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
  }
}

.sd-step-no {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.4375rem;
  height: 1.4375rem;
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--control-accent-text);
  background: var(--control-accent-bg);
  border: 1px solid var(--control-accent-border);
  border-radius: 50%;
}

.sd-step-title {
  margin: 0;
  font-size: 0.84rem;
  font-weight: 600;
  line-height: 1.4;
  color: var(--text-primary);
}

.sd-step-text {
  margin: 0.1875rem 0 0;
  font-size: 0.78rem;
  line-height: 1.6;
  color: var(--text-muted);
}

/* ================= 按钮 / 说明 ================= */
.sd-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
}

/* 默认按钮 = 设置页原来的玻璃胶囊：壁纸上的按钮不该比内容更亮。
   .ghost 才是带蓝调的强调档，只给「去看另一页」这类主动作。 */
.sd-btn {
  padding: 0.4375rem 1rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease, opacity 0.2s ease;

  &:hover:not(:disabled) {
    color: var(--text-primary);
    background: var(--glass-border);
    border-color: var(--glass-border-strong);
  }

  &.ghost {
    color: var(--color-primary-soft);
    background: var(--glass-active);
    border-color: var(--rain-chip-border);

    &:hover:not(:disabled) {
      background: var(--glass-active);
      border-color: var(--glass-border-strong);
    }
  }

  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
}

.sd-text {
  margin: 0;
  font-size: 0.8rem;
  line-height: 1.7;
  color: var(--text-secondary);
  text-wrap: pretty;
}

.sd-note {
  margin: 0;
  font-size: 0.7rem;
  line-height: 1.65;
  color: var(--text-muted);
  text-wrap: pretty;
}

/* 构建信息行：等宽字，和正文的散文拉开一档 —— 它是要被「对」的信息，不是用来读的 */
.sd-build {
  margin: 0;
  font-family: ui-monospace, Consolas, 'Courier New', monospace;
  font-size: 0.68rem;
  letter-spacing: 0.02em;
  color: var(--text-muted);
}

/* ================= 更新日志 =================
   一个小版本一块：版本号 + 一句话概括 + 日期，下面几条改动。
   条目用小圆点而不是列表序号 —— 改动之间没有先后顺序，编号只会让人以为要按顺序看。 */
.sd-log {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.sd-log-head {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.3125rem;
}

.sd-log-tag {
  font-family: ui-monospace, Consolas, 'Courier New', monospace;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--text-secondary);
}

/* 预览版小标：只在 src/config/changelog.js 的条目带 preview: true 时出现。
   用玻璃底 + 主色字，而不是 primary-soft 当底 —— mist 主题里 soft 与 strong 是同一个
   颜色值，那样写会出现同色同底、字直接看不见。 */
.sd-log-preview {
  flex: none;
  padding: 0.0625rem 0.375rem;
  font-size: 0.64rem;
  font-weight: 600;
  line-height: 1.5;
  color: var(--color-primary);
  background: var(--glass-bg-soft);
  border: 1px solid var(--glass-border);
  border-radius: 999px;
}

.sd-log-title {
  font-size: 0.78rem;
  color: var(--text-secondary);
}
/* 日期靠右、等宽数字：几块日志上下对齐，扫一眼就能看出时间跨度 */
.sd-log-date {
  flex: none;
  margin-left: auto;
  font-size: 0.68rem;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
}

.sd-log-items {
  display: flex;
  flex-direction: column;
  gap: 0.1875rem;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    position: relative;
    padding-left: 0.75rem;
    font-size: 0.76rem;
    line-height: 1.65;
    color: var(--text-muted);
    text-wrap: pretty;

    &::before {
      content: '';
      position: absolute;
      top: 0.63em;
      left: 0.1875rem;
      width: 0.25rem;
      height: 0.25rem;
      border-radius: 50%;
      background: var(--text-muted);
      opacity: 0.6;
    }
  }
}

/* 页脚署名：一条细线收在内容末尾，和卡片区分开。
   「无盈利」这类话放这儿当注解就行，不必在卡片标题上挂一枚胶囊去强调。 */
.sd-colophon {
  display: flex;
  flex-direction: column;
  gap: 0.4375rem;
  margin-top: -0.25rem;
  padding-top: 0.875rem;
  border-top: 1px solid var(--glass-border);
}

.sd-legal {
  margin: 0;
  font-size: 0.7rem;
  line-height: 1.7;
  color: var(--text-secondary);
  text-wrap: pretty;
}

/* 仓库地址按钮：左边地址、右边一枚「点击复制 → 已复制」的提示胶囊。
   地址过长时自己省略，提示永远贴在右端，点了不会跳位。 */
.sd-repo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.375rem 0.5rem 0.375rem 0.625rem;
  font-family: inherit;
  font-size: 0.76rem;
  text-align: left;
  color: var(--text-secondary);
  background: var(--surface-inset);
  border: 1px solid rgba(56, 189, 248, 0.32);
  border-radius: 0.5rem;
  cursor: pointer;
  transition: color 0.2s ease, border-color 0.2s ease;

  &:hover {
    color: var(--text-primary);
    border-color: var(--glass-border-strong);
  }

  &:active {
    border-color: var(--color-primary);
  }
}

.sd-repo-url {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sd-repo-tip {
  flex: none;
  padding: 0.0625rem 0.375rem;
  font-size: 0.66rem;
  font-weight: 600;
  line-height: 1.5;
  color: var(--text-muted);
  background: var(--glass-bg-soft);
  border: 1px solid transparent;
  border-radius: 999px;
  transition: color 0.2s ease, background-color 0.2s ease, border-color 0.2s ease;

  &.is-ok {
    color: var(--success-text);
    background: rgba(140, 200, 166, 0.16);
    border-color: rgba(140, 200, 166, 0.34);
  }

  &.is-fail {
    color: var(--warning-text);
    background: rgba(227, 163, 110, 0.14);
    border-color: rgba(227, 163, 110, 0.32);
  }
}

/* 提示换字：短淡入，不抢按钮本身的过渡 */
.repo-tip-enter-active,
.repo-tip-leave-active {
  transition: opacity 0.14s var(--ease), translate 0.14s var(--ease);
}

.repo-tip-enter-from {
  opacity: 0;
  translate: 0 0.1875rem;
}

.repo-tip-leave-to {
  opacity: 0;
  translate: 0 -0.1875rem;
}

/* ================= 窄屏：导轨收窄、边距收一档（壁纸本身按 1920 设计，这里只防火） ================= */
@media (max-width: 760px) {
  /* 两列键值到这一步每列只剩不到 200px，「和风天气 · 3 组域名轮询」会被折成两行；
     折行比多占两行更难读，所以退回单列 */
  .sd-kv-cols {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 700px) {
  /* 面板窄到这一步，两栏各自只剩两百出头，改成上下排更耐读；
     再挤下去（<700px）本来就该滚动，那时靠滚轮滚动，边缘用淡出兜着 */
  .sd-cols {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 860px) {
  .sd {
    --sd-nav-w: 11rem;
  }

  /* 正文的左右留白长在内容层上（见 .sd-scroll 的注释），窄屏要收就收这一层 */
  .sd-scroll,
  .sd-main-head {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  /* 窄窗口里两栏各自只有两百多，教程那段长说明先收起来：
     按钮上写的「打开图文教程：怎么申请域名与密钥」已经说清了去处，留着它只会把这一页顶到需要滚动 */
  .sd-cols .sd-callout .sd-text {
    display: none;
  }
}

/* 窗口不高时把面板再拔高一点（2% 的高度换一行字） */
@media (max-height: 780px) {
  .sd {
    --sd-h-default: min(92vh, 44rem);
  }
}

@media (prefers-reduced-transparency: reduce) {
  .sd {
    background: var(--surface-modal);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
  }
}

/* 减少动态效果：弹层不做位移 / 缩放 / 模糊，滑块也不滑（错峰那一档由全局规则关掉） */
@media (prefers-reduced-motion: reduce) {
  .sd-veil.Dialog-enter-active .sd,
  .sd-veil.Dialog-leave-active .sd {
    transition: none;
  }

  .sd-nav-thumb {
    transition: none;
  }

  .sd-status-icon.is-spinning {
    animation: none;
  }

  .repo-tip-enter-active,
  .repo-tip-leave-active {
    transition: none;
  }
}
</style>
