/**
 * Scratchpad — browser half of the bundle.
 *
 * One sidebar entry, one panel, both keyed by PANEL_ID:
 *  - `sidebar.panellist` renders the glyph the sidebar puts in its panel list,
 *    and its `label` is the row's text and tooltip;
 *  - the keyed `main` slot renders the page when that row is selected.
 * The sidebar owns the button and the selection state; this file never draws
 * the row itself and never touches the DOM outside its own subtree.
 *
 * Notes live in this browser's localStorage: the panel is a local scratchpad,
 * not session data, so nothing here is appended to a Session log.
 */
window.__ModuleLoader__.load({
  id: 'dsh-scratchpad',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useRef, useState } = React

    /** Dictionary namespace owned by this plugin. */
    const NS = 'scratchpad'
    /** The one id tying the sidebar row and the main panel together. */
    const PANEL_ID = 'scratchpad'
    /** Browser-local storage key; bump the suffix to drop old notes. */
    const STORAGE_KEY = 'dsh-scratchpad:notes:v1'
    /** Debounce before a keystroke reaches storage. */
    const SAVE_DELAY_MS = 400

    /** Simplified Chinese dictionary (key-set source of truth). */
    const zh = {
      'panel.title': '便签',
      'panel.subtitle': '随手记两笔，自动存在这台机器的浏览器里。',
      'action.new': '新建便签',
      'action.back': '返回列表',
      'action.copy': '复制',
      'action.copied': '已复制',
      'action.delete': '删除',
      'action.confirmDelete': '确认删除',
      'action.cancel': '取消',
      'action.conversation': '回到会话',
      'count': '{count} 条',
      'empty.title': '还没有便签',
      'empty.body': '点右上角「新建便签」，把刚才想到的事记下来。',
      'note.untitled': '未命名便签',
      'note.saving': '保存中…',
      'note.saved': '已保存',
      'editor.titlePlaceholder': '标题',
      'editor.bodyPlaceholder': '写点什么…',
      'tags.label': '标签',
      'tags.placeholder': '加标签，回车确认',
      'tags.all': '全部',
      'tags.remove': '移除标签 {tag}',
      'todo.title': '待办',
      'todo.add': '加一条待办',
      'todo.empty': '正文里写「- [ ] 事情」就会出现在这里，点一下打勾。',
      'attach.title': '附件',
      'attach.image': '图片',
      'attach.file': '文件',
      'attach.remove': '移除 {name}',
      'attach.hint': '也可以直接粘贴图片或把文件拖进来；单个 ≤ {max}，每条便签 ≤ {total}。',
      'attach.tooBig': '{name} 太大（上限 {max}）',
      'attach.full': '这条便签的附件额度满了（{total}）',
      'attach.limit': '存储快满了，附件没能保存',
      'data.export': '导出',
      'data.import': '导入',
      'data.imported': '已导入 {count} 条',
      'data.badFile': '这个文件不是便签导出文件',
    }

    /** English dictionary, complete against the zh key set. */
    const en = {
      'panel.title': 'Scratchpad',
      'panel.subtitle': 'Jot things down; notes stay in this browser.',
      'action.new': 'New note',
      'action.back': 'Back to list',
      'action.copy': 'Copy',
      'action.copied': 'Copied',
      'action.delete': 'Delete',
      'action.confirmDelete': 'Delete',
      'action.cancel': 'Cancel',
      'action.conversation': 'Back to conversation',
      'count': '{count}',
      'empty.title': 'No notes yet',
      'empty.body': 'Use "New note" above to write the first one.',
      'note.untitled': 'Untitled note',
      'note.saving': 'Saving…',
      'note.saved': 'Saved',
      'editor.titlePlaceholder': 'Title',
      'editor.bodyPlaceholder': 'Write something…',
      'tags.label': 'Tags',
      'tags.placeholder': 'Add a tag, Enter to confirm',
      'tags.all': 'All',
      'tags.remove': 'Remove tag {tag}',
      'todo.title': 'To-do',
      'todo.add': 'Add a to-do',
      'todo.empty': 'Lines like "- [ ] do this" show up here; click to tick them.',
      'attach.title': 'Attachments',
      'attach.image': 'Image',
      'attach.file': 'File',
      'attach.remove': 'Remove {name}',
      'attach.hint': 'You can also paste an image or drop files here; ≤ {max} each, ≤ {total} per note.',
      'attach.tooBig': '{name} is too large (limit {max})',
      'attach.full': 'This note has no attachment budget left ({total})',
      'attach.limit': 'Storage is nearly full; the attachment was not saved',
      'data.export': 'Export',
      'data.import': 'Import',
      'data.imported': 'Imported {count}',
      'data.badFile': 'That file is not a scratchpad export',
    }

    //#region storage
    /** @returns whether one stored value is still a note this version understands. */
    function isNote(value) {
      return (
        typeof value === 'object'
        && value !== null
        && typeof value.id === 'string'
        && typeof value.title === 'string'
        && typeof value.body === 'string'
        && typeof value.updatedAt === 'number'
      )
    }

    /** @returns every stored note, newest first; tolerates absent or broken storage. */
    function readNotes() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw === null) return []
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return parsed.filter(isNote).map(normalizeNote).sort((left, right) => right.updatedAt - left.updatedAt)
      } catch (_error) {
        return []
      }
    }

    /** Write the whole list; a full or unavailable storage keeps the panel usable for this session. */
    function writeNotes(notes) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
      } catch (_error) {
        /* private mode or quota: the in-memory list stays authoritative. */
      }
    }

    /** @returns a collision-free note id. */
    function newId() {
      try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
      } catch (_error) {
        /* fall through to the time-based id */
      }
      return `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    }
    //#endregion

    //#region note model helpers
    /** localStorage is shared by the whole Web UI, so attachments get a budget. */
    const MAX_ATTACHMENT_BYTES = 700 * 1024
    const MAX_NOTE_ATTACHMENT_BYTES = 2.5 * 1024 * 1024

    /** Fill in the fields that notes written by older versions do not have. */
    function normalizeNote(value) {
      return {
        ...value,
        tags: Array.isArray(value.tags)
          ? value.tags.filter((tag) => typeof tag === 'string' && tag !== '')
          : [],
        attachments: Array.isArray(value.attachments)
          ? value.attachments.filter((item) => item && typeof item.dataUrl === 'string')
          : [],
      }
    }

    /** @returns the byte cost of one note's attachments (a data URL is base64). */
    function attachmentBytes(note) {
      let total = 0
      for (const item of note.attachments) {
        total += Math.ceil((item.dataUrl.length * 3) / 4)
      }
      return total
    }

    function formatBytes(bytes) {
      if (bytes < 1024) return `${bytes} B`
      if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    }

    /** @returns the file as a data URL, or null when the browser refuses to read it. */
    function readAsDataUrl(file) {
      return new Promise((resolve) => {
        try {
          const reader = new FileReader()
          reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
          reader.onerror = () => resolve(null)
          reader.readAsDataURL(file)
        } catch (_error) {
          resolve(null)
        }
      })
    }

    /**
     * Task lists live in the plain-text body: a line is a to-do when it reads
     * `- [ ] text` or `- [x] text`. There is no second copy to get out of sync,
     * and the Markdown still makes sense anywhere else the note is pasted.
     */
    const TODO_RE = /^(\s*[-*]\s+\[)( |x|X)(\]\s+)(.*)$/

    /** @returns every task line in the body, with its line index. */
    function parseTodos(body) {
      const items = []
      body.split('\n').forEach((line, index) => {
        const match = TODO_RE.exec(line)
        if (match === null) return
        items.push({ index, done: match[2].toLowerCase() === 'x', text: match[4] })
      })
      return items
    }

    /** @returns the body with the checkbox on one line flipped. */
    function toggleTodoAt(body, lineIndex) {
      return body
        .split('\n')
        .map((line, index) => {
          if (index !== lineIndex) return line
          const match = TODO_RE.exec(line)
          if (match === null) return line
          const next = match[2].toLowerCase() === 'x' ? ' ' : 'x'
          return `${match[1]}${next}${match[3]}${match[4]}`
        })
        .join('\n')
    }
    //#endregion

    //#region formatting
    /** @returns the row title: the explicit title, else the first non-empty body line. */
    function noteTitle(note, t) {
      const title = note.title.trim()
      if (title !== '') return title
      const firstLine = note.body
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line !== '')
      return firstLine === undefined ? t('note.untitled') : firstLine
    }

    /** @returns a one-paragraph preview of the body. */
    function notePreview(note) {
      return note.body.replace(/\s+/g, ' ').trim().slice(0, 180)
    }

    /** Format an edit time in the active language. */
    function formatTime(milliseconds, locale) {
      try {
        return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(milliseconds))
      } catch (_error) {
        return new Date(milliseconds).toLocaleString()
      }
    }
    //#endregion

    //#region icons
    /** Line glyphs on a 16-unit grid; they inherit the row colour through currentColor. */
    const ICON_PATHS = {
      note: [
        ['path', { d: 'M3.5 2.25h6.2L12.5 5.2V13a.75.75 0 0 1-.75.75h-8.5A.75.75 0 0 1 2.5 13V3a.75.75 0 0 1 .75-.75Z' }],
        ['path', { d: 'M9.5 2.4v3.1h3.05' }],
        ['path', { d: 'M5.4 8.6h5.2M5.4 11.1h3.4' }],
      ],
      plus: [['path', { d: 'M8 3.4v9.2M3.4 8h9.2' }]],
      back: [['path', { d: 'M9.8 3.4 5.2 8l4.6 4.6' }]],
      copy: [
        ['path', { d: 'M5.6 5.6h7.1v7.1H5.6z' }],
        ['path', { d: 'M10.4 5.6V3.9a.6.6 0 0 0-.6-.6H3.9a.6.6 0 0 0-.6.6v5.9a.6.6 0 0 0 .6.6h1.7' }],
      ],
      trash: [
        ['path', { d: 'M2.9 4.3h10.2' }],
        ['path', { d: 'M6.4 4.3V2.9h3.2v1.4' }],
        ['path', { d: 'm4.3 4.3.62 8.4a.7.7 0 0 0 .7.65h4.76a.7.7 0 0 0 .7-.65l.62-8.4' }],
      ],
      check: [['path', { d: 'm3.5 8.4 3 3 6-6.2' }]],
    }

    /** Paint-server id for the sidebar glyph; each panel icon gets its own id. */
    const INK_ID = 'dsh-sp-ink'

    /** The one diagonal gradient every icon in this plugin shares, in the 16-unit grid. */
    const INK_STOPS = [
      { offset: '0%', color: '#4D6BFE', className: 'dsh-sp-inkFrom' },
      { offset: '55%', color: '#6C7BFF', className: 'dsh-sp-inkMid' },
      { offset: '100%', color: '#8B5CF6', className: 'dsh-sp-inkTo' },
    ]

    /**
     * The shared gradient element. Every SVG that paints with it carries one
     * copy under its own id, so nothing depends on another icon being mounted.
     * `userSpaceOnUse` matters: a horizontal line has a zero-height bounding box,
     * and an object-space gradient would drop it entirely.
     */
    function InkGradient({ id }) {
      return h(
        'linearGradient',
        { id, gradientUnits: 'userSpaceOnUse', x1: 2, y1: 2, x2: 14, y2: 14 },
        INK_STOPS.map((stop) => h('stop', {
          key: stop.offset,
          offset: stop.offset,
          stopColor: stop.color,
          className: stop.className,
        })),
      )
    }

    /**
     * Render one decorative line glyph.
     *
     * `ink` paints it with the plugin gradient instead of `currentColor`. Icons
     * that sit on a filled control (the primary button, the solid danger
     * confirm) keep the inherited colour so they stay readable on that fill.
     */
    function Icon({ name, size = 16, ink = false }) {
      const paths = ICON_PATHS[name] ?? []
      const gradientId = ink ? `dsh-sp-ink-${name}` : undefined
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: gradientId === undefined ? 'currentColor' : `url(#${gradientId})`,
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          focusable: 'false',
          style: { display: 'block', flex: 'none' },
        },
        gradientId === undefined ? null : h('defs', { key: 'ink' }, h(InkGradient, { id: gradientId })),
        paths.map((child, index) => h(child[0], { key: index, ...child[1] })),
      )
    }

    /**
     * The glyph inside one sidebar panel row: a note sheet whose two text lines
     * keep rewriting themselves and whose corner breathes, so the entry reads as
     * a live thing instead of a static picture.
     *
     * The ink is one diagonal gradient (blue → violet) instead of a flat
     * `currentColor`, so the small glyph stays legible on both the light and the
     * dark sidebar. The paint server uses `userSpaceOnUse`: a horizontal line has
     * a zero-height bounding box, and an object-space gradient would drop it
     * entirely.
     *
     * The motion lives in CSS (see the stylesheet below), stops itself under
     * `prefers-reduced-motion`, and speeds up while the pointer is on the row.
     * `pathLength={1}` normalizes both lines so they draw at the same rate
     * however long they are. The sidebar supplies the square edge and its own
     * accessible label, so everything here stays decorative.
     */
    function NoteGlyph({ size }) {
      const edge = size ?? 16
      return h(
        'svg',
        {
          width: edge,
          height: edge,
          viewBox: '0 0 16 16',
          fill: 'none',
          stroke: `url(#${INK_ID})`,
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
          focusable: 'false',
          className: 'dsh-sp-glyph',
          style: { display: 'block', flex: 'none' },
        },
        h('defs', { key: 'ink' }, h(InkGradient, { id: INK_ID })),
        h('path', {
          key: 'sheet',
          className: 'dsh-sp-glyphSheet',
          fill: `url(#${INK_ID})`,
          fillOpacity: 0.2,
          d: 'M3.5 2.25h6.2L12.5 5.2V13a.75.75 0 0 1-.75.75h-8.5A.75.75 0 0 1 2.5 13V3a.75.75 0 0 1 .75-.75Z',
        }),
        h('path', {
          key: 'fold',
          className: 'dsh-sp-glyphFold',
          d: 'M9.5 2.4v3.1h3.05',
        }),
        h('path', {
          key: 'lineA',
          className: 'dsh-sp-glyphLine dsh-sp-lineA',
          pathLength: 1,
          d: 'M5.4 8.6h5.2',
        }),
        h('path', {
          key: 'lineB',
          className: 'dsh-sp-glyphLine dsh-sp-lineB',
          pathLength: 1,
          d: 'M5.4 11.1h3.4',
        }),
      )
    }

    /** The sidebar row's icon: the animated glyph at the edge the row asks for. */
    function ScratchpadIcon({ size }) {
      return h(NoteGlyph, { size })
    }
    //#endregion

    //#region delete control
    /**
     * One delete affordance that asks first: an icon (or labelled button) that
     * becomes an inline confirm pair, so deleting a note never opens a modal.
     */
    function DeleteControl({ t, confirming, withLabel, onAsk, onCancel, onConfirm }) {
      if (!confirming) {
        const label = t('action.delete')
        if (!withLabel) {
          return h(
            'button',
            { type: 'button', className: 'dsh-sp-iconBtn', 'aria-label': label, title: label, onClick: onAsk },
            h(Icon, { name: 'trash', ink: true }),
          )
        }
        return h(
          'button',
          { type: 'button', className: 'dsh-sp-btn dsh-sp-btnDanger', onClick: onAsk },
          h(Icon, { name: 'trash', key: 'icon' }),
          h('span', { key: 'label' }, label),
        )
      }
      return h(
        'span',
        { className: 'dsh-sp-confirm' },
        h(
          'button',
          { type: 'button', className: 'dsh-sp-btn dsh-sp-btnDangerSolid', onClick: onConfirm, key: 'confirm' },
          t('action.confirmDelete'),
        ),
        h(
          'button',
          { type: 'button', className: 'dsh-sp-btn', onClick: onCancel, key: 'cancel' },
          t('action.cancel'),
        ),
      )
    }
    //#endregion

    //#region panel page
    /**
     * The Scratchpad page: a list of notes with one note open for editing.
     *
     * @param props - slot props: `t` from the plugin namespace, `useLocale` from
     *   the injected locale hook, and `goConversation` from the layout service.
     */
    function ScratchpadPage(props) {
      const { t, useLocale, goConversation } = props
      const locale = useLocale((snapshot) => snapshot.active)
      const [notes, setNotes] = useState(readNotes)
      const [openId, setOpenId] = useState(null)
      const [confirmId, setConfirmId] = useState(null)
      const [pending, setPending] = useState(false)
      const [copied, setCopied] = useState(false)
      const [filterTag, setFilterTag] = useState(null)
      const [tagDraft, setTagDraft] = useState('')
      const [notice, setNotice] = useState('')

      const notesRef = useRef(notes)
      notesRef.current = notes
      const saveTimer = useRef(null)
      const bodyRef = useRef(null)
      const imageInput = useRef(null)
      const fileInput = useRef(null)
      const importInput = useRef(null)
      const titleRef = useRef(null)

      /** Replace the list and schedule one debounced write. */
      const commit = useCallback((next) => {
        notesRef.current = next
        setNotes(next)
        setPending(true)
        if (saveTimer.current !== null) clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(() => {
          saveTimer.current = null
          writeNotes(notesRef.current)
          setPending(false)
        }, SAVE_DELAY_MS)
      }, [])

      /* Leaving the panel must not lose the last keystrokes. */
      useEffect(() => () => {
        if (saveTimer.current !== null) {
          clearTimeout(saveTimer.current)
          saveTimer.current = null
          writeNotes(notesRef.current)
        }
      }, [])

      const openNote = notes.find((note) => note.id === openId) ?? null
      const todos = openNote === null ? [] : parseTodos(openNote.body)
      /* One flat tag pool for the filter row; first-seen order. */
      const tagPool = []
      for (const note of notes) {
        for (const tag of note.tags) {
          if (!tagPool.includes(tag)) tagPool.push(tag)
        }
      }
      const visible = filterTag === null ? notes : notes.filter((note) => note.tags.includes(filterTag))

      const edit = (patch) => {
        if (openNote === null) return
        commit(notesRef.current.map((note) => (
          note.id === openNote.id ? { ...note, ...patch, updatedAt: Date.now() } : note
        )))
      }

      /** One transient line at the bottom of the panel; clears itself. */
      const notify = (text) => {
        setNotice(text)
        window.setTimeout(() => setNotice(''), 3200)
      }

      const addTag = () => {
        if (openNote === null) return
        const tag = tagDraft.trim().replace(/^#+/, '')
        setTagDraft('')
        if (tag === '' || openNote.tags.includes(tag)) return
        edit({ tags: openNote.tags.concat(tag).slice(0, 12) })
      }

      const removeTag = (tag) => {
        if (openNote === null) return
        edit({ tags: openNote.tags.filter((item) => item !== tag) })
      }

      /** Read dropped or picked files into the note, within its byte budget. */
      const addFiles = async (fileList) => {
        if (openNote === null) return
        const files = Array.from(fileList || [])
        if (files.length === 0) return
        const kept = openNote.attachments.slice()
        let bytes = attachmentBytes(openNote)
        for (const file of files) {
          if (file.size > MAX_ATTACHMENT_BYTES) {
            notify(t('attach.tooBig', { name: file.name, max: formatBytes(MAX_ATTACHMENT_BYTES) }))
            continue
          }
          if (bytes + file.size > MAX_NOTE_ATTACHMENT_BYTES) {
            notify(t('attach.full', { total: formatBytes(MAX_NOTE_ATTACHMENT_BYTES) }))
            break
          }
          const dataUrl = await readAsDataUrl(file)
          if (dataUrl === null) continue
          kept.push({
            id: newId(),
            name: file.name === '' ? 'file' : file.name,
            type: file.type === '' ? 'application/octet-stream' : file.type,
            size: file.size,
            dataUrl,
          })
          bytes += file.size
        }
        if (kept.length !== openNote.attachments.length) edit({ attachments: kept })
      }

      const removeAttachment = (id) => {
        if (openNote === null) return
        edit({ attachments: openNote.attachments.filter((item) => item.id !== id) })
      }

      const toggleTodo = (lineIndex) => {
        if (openNote === null) return
        edit({ body: toggleTodoAt(openNote.body, lineIndex) })
      }

      const appendTodo = () => {
        if (openNote === null) return
        const body = openNote.body.replace(/\s+$/, '')
        edit({ body: body === '' ? '- [ ] ' : `${body}\n- [ ] ` })
        const area = bodyRef.current
        if (area !== null) {
          area.focus()
          try {
            area.setSelectionRange(area.value.length, area.value.length)
          } catch (_error) {
            /* an unsupported control keeps its cursor */
          }
        }
      }

      const exportNotes = () => {
        try {
          const blob = new Blob([JSON.stringify({ version: 1, exportedAt: Date.now(), notes: notesRef.current }, null, 2)], {
            type: 'application/json',
          })
          const url = URL.createObjectURL(blob)
          const anchor = document.createElement('a')
          anchor.href = url
          anchor.download = `scratchpad-${new Date().toISOString().slice(0, 10)}.json`
          document.body.appendChild(anchor)
          anchor.click()
          anchor.remove()
          window.setTimeout(() => URL.revokeObjectURL(url), 1000)
        } catch (_error) {
          notify(t('data.badFile'))
        }
      }

      const importNotes = (file) => {
        if (file === undefined || file === null) return
        const reader = new FileReader()
        reader.onload = () => {
          try {
            const parsed = JSON.parse(String(reader.result))
            const incoming = Array.isArray(parsed) ? parsed : Array.isArray(parsed.notes) ? parsed.notes : []
            const valid = incoming.filter(isNote).map(normalizeNote)
            if (valid.length === 0) {
              notify(t('data.badFile'))
              return
            }
            const merged = new Map(notesRef.current.map((note) => [note.id, note]))
            for (const note of valid) merged.set(note.id, { ...(merged.get(note.id) || {}), ...note })
            commit(Array.from(merged.values()))
            notify(t('data.imported', { count: valid.length }))
          } catch (_error) {
            notify(t('data.badFile'))
          }
        }
        reader.onerror = () => notify(t('data.badFile'))
        reader.readAsText(file)
      }

      const addNote = () => {        const note = { id: newId(), title: '', body: '', updatedAt: Date.now(), tags: [], attachments: [] }
        commit([note, ...notesRef.current])
        setConfirmId(null)
        setCopied(false)
        setTagDraft('')
        setNotice('')
        setOpenId(note.id)
      }

      const closeEditor = () => {
        const current = notesRef.current.find((note) => note.id === openId)
        /* A brand-new note nobody wrote into is not worth keeping. */
        if (current !== undefined && current.title.trim() === '' && current.body.trim() === '') {
          commit(notesRef.current.filter((note) => note.id !== openId))
        }
        setConfirmId(null)
        setCopied(false)
        setOpenId(null)
      }

      const remove = (id) => {
        commit(notesRef.current.filter((note) => note.id !== id))
        setConfirmId(null)
        setCopied(false)
        if (openId === id) setOpenId(null)
      }

      const copy = () => {
        if (openNote === null) return
        const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
        if (clipboard === undefined || typeof clipboard.writeText !== 'function') return
        const title = openNote.title.trim()
        const text = title === '' ? openNote.body : `${title}\n\n${openNote.body}`
        try {
          clipboard.writeText(text).then(
            () => setCopied(true),
            () => setCopied(false),
          )
        } catch (_error) {
          setCopied(false)
        }
      }

      /* Focus the title of a note the user just created. */
      useEffect(() => {
        if (openId === null) return
        const input = titleRef.current
        if (input !== null && input.value === '') input.focus()
      }, [openId])

      const onKeyDown = (event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return
        if (confirmId !== null) {
          event.preventDefault()
          event.stopPropagation()
          setConfirmId(null)
          return
        }
        if (openId !== null) {
          event.preventDefault()
          event.stopPropagation()
          closeEditor()
        }
      }

      const heading = h(
        'header',
        { className: 'dsh-sp-heading', key: 'heading' },
        h(
          'div',
          { className: 'dsh-sp-headingText' },
          h(
            'div',
            { className: 'dsh-sp-titleRow' },
            h('h1', { className: 'dsh-sp-title' }, t('panel.title')),
            notes.length === 0
              ? null
              : h('span', { className: 'dsh-sp-count' }, t('count', { count: notes.length })),
          ),
          h('p', { className: 'dsh-sp-subtitle' }, t('panel.subtitle')),
        ),
        h(
          'div',
          { className: 'dsh-sp-actions' },
          h(
            'button',
            { type: 'button', className: 'dsh-sp-btn', onClick: goConversation },
            t('action.conversation'),
          ),
          h('button', { type: 'button', className: 'dsh-sp-btn', onClick: exportNotes }, t('data.export')),
          h('button', {
            type: 'button',
            className: 'dsh-sp-btn',
            onClick: () => {
              if (importInput.current !== null) importInput.current.click()
            },
          }, t('data.import')),
          h('input', {
            ref: importInput,
            type: 'file',
            accept: 'application/json,.json',
            hidden: true,
            onChange: (event) => {
              importNotes((event.target.files || [])[0])
              event.target.value = ''
            },
          }),
          openId === null
            ? h(
              'button',
              { type: 'button', className: 'dsh-sp-btn dsh-sp-btnPrimary', onClick: addNote },
              h(Icon, { name: 'plus', key: 'icon', size: 14 }),
              h('span', { key: 'label' }, t('action.new')),
            )
            : null,
        ),
      )

      let body
      if (openNote !== null) {
        body = h(
          'div',
          { className: 'dsh-sp-editor', key: 'editor' },
          h(
            'div',
            { className: 'dsh-sp-editorBar' },
            h(
              'button',
              { type: 'button', className: 'dsh-sp-btn', onClick: closeEditor },
              h(Icon, { name: 'back', key: 'icon', size: 14, ink: true }),
              h('span', { key: 'label' }, t('action.back')),
            ),
            h(
              'span',
              { className: 'dsh-sp-editorMeta', 'aria-live': 'polite' },
              pending ? t('note.saving') : t('note.saved'),
            ),
          ),
          h('input', {
            key: 'title',
            ref: titleRef,
            type: 'text',
            className: 'dsh-sp-titleInput',
            value: openNote.title,
            placeholder: t('editor.titlePlaceholder'),
            'aria-label': t('editor.titlePlaceholder'),
            onChange: (event) => edit({ title: event.target.value }),
          }),
          h(
            'div',
            { className: 'dsh-sp-tags', key: 'tags' },
            h('span', { className: 'dsh-sp-tagsLabel' }, t('tags.label')),
            openNote.tags.map((tag) => h(
              'span',
              { className: 'dsh-sp-tag', key: tag },
              h('span', null, tag),
              h('button', {
                type: 'button',
                className: 'dsh-sp-tagX',
                title: t('tags.remove', { tag }),
                'aria-label': t('tags.remove', { tag }),
                onClick: () => removeTag(tag),
              }, '×'),
            )),
            h('input', {
              type: 'text',
              className: 'dsh-sp-tagInput',
              value: tagDraft,
              placeholder: t('tags.placeholder'),
              onChange: (event) => setTagDraft(event.target.value),
              onKeyDown: (event) => {
                if (event.key === 'Enter' || event.key === ',') {
                  event.preventDefault()
                  addTag()
                  return
                }
                if (event.key === 'Backspace' && tagDraft === '' && openNote.tags.length > 0) {
                  removeTag(openNote.tags[openNote.tags.length - 1])
                }
              },
              onBlur: addTag,
            }),
          ),
          h('textarea', {
            key: 'body',
            ref: bodyRef,
            className: 'dsh-sp-body',
            value: openNote.body,
            placeholder: t('editor.bodyPlaceholder'),
            'aria-label': t('editor.bodyPlaceholder'),
            onChange: (event) => edit({ body: event.target.value }),
            onPaste: (event) => {
              const files = Array.from((event.clipboardData && event.clipboardData.files) || [])
              if (files.length === 0) return
              event.preventDefault()
              addFiles(files)
            },
            onDragOver: (event) => {
              event.preventDefault()
            },
            onDrop: (event) => {
              const files = Array.from((event.dataTransfer && event.dataTransfer.files) || [])
              if (files.length === 0) return
              event.preventDefault()
              addFiles(files)
            },
          }),
          h(
            'div',
            { className: 'dsh-sp-section', key: 'todos' },
            h(
              'div',
              { className: 'dsh-sp-sectionHead' },
              h('span', null, t('todo.title')),
              h('button', { type: 'button', className: 'dsh-sp-mini', onClick: appendTodo }, t('todo.add')),
            ),
            todos.length === 0
              ? h('p', { className: 'dsh-sp-hint' }, t('todo.empty'))
              : h(
                'ul',
                { className: 'dsh-sp-todos' },
                todos.map((item) => h(
                  'li',
                  { className: 'dsh-sp-todo' + (item.done ? ' is-done' : ''), key: item.index },
                  h('input', {
                    type: 'checkbox',
                    className: 'dsh-sp-check',
                    checked: item.done,
                    'aria-label': item.text,
                    onChange: () => toggleTodo(item.index),
                  }),
                  h('span', { className: 'dsh-sp-todoText' }, item.text),
                )),
              ),
          ),
          h(
            'div',
            { className: 'dsh-sp-section', key: 'attachments' },
            h(
              'div',
              { className: 'dsh-sp-sectionHead' },
              h('span', null, t('attach.title')),
              h(
                'span',
                { className: 'dsh-sp-sectionActions' },
                h('button', {
                  type: 'button',
                  className: 'dsh-sp-mini',
                  onClick: () => {
                    if (imageInput.current !== null) imageInput.current.click()
                  },
                }, t('attach.image')),
                h('button', {
                  type: 'button',
                  className: 'dsh-sp-mini',
                  onClick: () => {
                    if (fileInput.current !== null) fileInput.current.click()
                  },
                }, t('attach.file')),
              ),
            ),
            h('input', {
              ref: imageInput,
              type: 'file',
              accept: 'image/*',
              multiple: true,
              hidden: true,
              onChange: (event) => {
                addFiles(event.target.files)
                event.target.value = ''
              },
            }),
            h('input', {
              ref: fileInput,
              type: 'file',
              multiple: true,
              hidden: true,
              onChange: (event) => {
                addFiles(event.target.files)
                event.target.value = ''
              },
            }),
            openNote.attachments.length === 0
              ? h('p', { className: 'dsh-sp-hint' }, t('attach.hint', {
                max: formatBytes(MAX_ATTACHMENT_BYTES),
                total: formatBytes(MAX_NOTE_ATTACHMENT_BYTES),
              }))
              : h(
                'ul',
                { className: 'dsh-sp-files' },
                openNote.attachments.map((item) => h(
                  'li',
                  { className: 'dsh-sp-file', key: item.id },
                  item.type.startsWith('image/')
                    ? h(
                      'a',
                      { className: 'dsh-sp-thumbLink', href: item.dataUrl, target: '_blank', rel: 'noreferrer' },
                      h('img', { className: 'dsh-sp-thumb', src: item.dataUrl, alt: item.name }),
                    )
                    : h('span', { className: 'dsh-sp-fileGlyph' }, '▤'),
                  h(
                    'span',
                    { className: 'dsh-sp-fileMeta' },
                    h('span', { className: 'dsh-sp-fileName', title: item.name }, item.name),
                    h('span', { className: 'dsh-sp-fileSize' }, formatBytes(item.size || 0)),
                  ),
                  h('button', {
                    type: 'button',
                    className: 'dsh-sp-iconBtn',
                    title: t('attach.remove', { name: item.name }),
                    'aria-label': t('attach.remove', { name: item.name }),
                    onClick: () => removeAttachment(item.id),
                  }, h(Icon, { name: 'trash', ink: true, size: 14 })),
                )),
              ),
          ),
          h(
            'div',
            { className: 'dsh-sp-editorActions', key: 'actions' },
            h(
              'button',
              {
                type: 'button',
                className: 'dsh-sp-btn',
                onClick: copy,
                disabled: openNote.title.trim() === '' && openNote.body.trim() === '',
              },
              h(Icon, { name: copied ? 'check' : 'copy', key: 'icon', ink: true }),
              h('span', { key: 'label' }, copied ? t('action.copied') : t('action.copy')),
            ),
            h(DeleteControl, {
              key: 'delete',
              t,
              withLabel: true,
              confirming: confirmId === openNote.id,
              onAsk: () => setConfirmId(openNote.id),
              onCancel: () => setConfirmId(null),
              onConfirm: () => remove(openNote.id),
            }),
          ),
        )
      } else if (notes.length === 0) {
        body = h(
          'div',
          { className: 'dsh-sp-empty', key: 'empty' },
          h('span', { className: 'dsh-sp-emptyIcon' }, h(Icon, { name: 'note', size: 22, ink: true })),
          h('p', { className: 'dsh-sp-emptyTitle' }, t('empty.title')),
          h('p', { className: 'dsh-sp-emptyBody' }, t('empty.body')),
        )
      } else {
        body = h(
          'div',
          { key: 'listwrap' },
          tagPool.length === 0
            ? null
            : h(
              'div',
              { className: 'dsh-sp-filters' },
              h('button', {
                type: 'button',
                className: 'dsh-sp-filter' + (filterTag === null ? ' is-on' : ''),
                onClick: () => setFilterTag(null),
              }, t('tags.all')),
              tagPool.map((tag) => h('button', {
                type: 'button',
                key: tag,
                className: 'dsh-sp-filter' + (filterTag === tag ? ' is-on' : ''),
                onClick: () => setFilterTag(filterTag === tag ? null : tag),
              }, tag)),
            ),
          h(
            'ul',
            { className: 'dsh-sp-list', key: 'list' },
            visible.map((note) => h(
            'li',
            { className: 'dsh-sp-item', key: note.id },
            h(
              'button',
              { type: 'button', className: 'dsh-sp-open', onClick: () => { setConfirmId(null); setCopied(false); setOpenId(note.id) } },
              h('span', { className: 'dsh-sp-noteTitle' }, noteTitle(note, t)),
              notePreview(note) === '' ? null : h('span', { className: 'dsh-sp-preview' }, notePreview(note)),
              note.tags.length === 0
                ? null
                : h(
                  'span',
                  { className: 'dsh-sp-itemTags' },
                  note.tags.map((tag) => h('span', { className: 'dsh-sp-tag dsh-sp-tagSm', key: tag }, tag)),
                ),
              h('span', { className: 'dsh-sp-meta' }, formatTime(note.updatedAt, locale)),
            ),
            h(
              'span',
              { className: 'dsh-sp-itemActions' },
              h(DeleteControl, {
                t,
                withLabel: false,
                confirming: confirmId === note.id,
                onAsk: () => setConfirmId(note.id),
                onCancel: () => setConfirmId(null),
                onConfirm: () => remove(note.id),
              }),
            ),
            )),
          ),
        )
      }

      return h(
        'section',
        { className: 'dsh-sp-page', 'aria-label': t('panel.title'), onKeyDown },
        h(
          'div',
          { className: 'dsh-sp-scroll' },
          h(
            'div',
            { className: 'dsh-sp-content' },
            heading,
            h('div', { className: 'dsh-sp-bodyArea' }, body),
            notice === '' ? null : h('p', { className: 'dsh-sp-notice' }, notice),
          ),
        ),
      )
    }
    //#endregion

    //#region styles
    const STYLE_TAG_ID = 'dsh-scratchpad/scratchpad.css'
    const css = `
.dsh-sp-page{width:100%;height:100%;min-height:0;display:flex;flex-direction:column;overflow:hidden;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.6}
.dsh-sp-scroll{flex:1;min-height:0;overflow:auto;scrollbar-width:thin;scrollbar-color:var(--dsw-alias-scrollbar-bg-l2,transparent) transparent}
.dsh-sp-content{box-sizing:border-box;max-width:960px;margin:0 auto;padding:0 clamp(24px,4vw,48px) 48px}
.dsh-sp-heading{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:16px;padding-top:28px}
[data-platform=darwin] .dsh-sp-heading{padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}
.dsh-sp-headingText{min-width:0;display:flex;flex-direction:column;gap:2px}
.dsh-sp-titleRow{display:flex;align-items:center;gap:8px;min-width:0}
.dsh-sp-title{margin:0;font-size:20px;font-weight:500;line-height:28px;min-width:0}
.dsh-sp-count{flex:none;padding:0 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-2,#f0f0f0);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:20px}
.dsh-sp-subtitle{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.dsh-sp-actions{flex:none;display:flex;align-items:center;gap:8px}
.dsh-sp-btn{box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border:none;border-radius:var(--dsw-radius-lg,16px);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;white-space:nowrap;cursor:pointer}
@media (hover:hover){.dsh-sp-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}}
.dsh-sp-btn:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4d93f8));outline-offset:2px}
.dsh-sp-btn[disabled]{opacity:.45;cursor:default;background:transparent}
.dsh-sp-btnPrimary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}
@media (hover:hover){.dsh-sp-btnPrimary:hover{background:var(--dsw-alias-button-primary-hover)}}
.dsh-sp-btnDanger{color:var(--dsw-alias-state-error-primary)}
.dsh-sp-btnDangerSolid{background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-label-primary-foreground)}
.dsh-sp-bodyArea{display:block}
.dsh-sp-list{list-style:none;margin:16px 0 0;padding:0;display:flex;flex-direction:column;gap:2px}
.dsh-sp-item{display:flex;align-items:center;gap:4px;padding:2px;border-radius:var(--dsw-radius-md,12px)}
@media (hover:hover){.dsh-sp-item:hover{background:var(--dsw-alias-interactive-bg-hover)}}
.dsh-sp-open{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;padding:8px 10px;border:none;border-radius:inherit;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.dsh-sp-open:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4d93f8));outline-offset:-2px}
.dsh-sp-noteTitle{font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-sp-preview{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.dsh-sp-meta{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:12px;line-height:18px}
.dsh-sp-itemActions{flex:none;display:flex;align-items:center;gap:4px;padding-right:4px}
.dsh-sp-iconBtn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:none;border-radius:var(--dsw-radius-sm,8px);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
@media (hover:hover){.dsh-sp-iconBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}}
.dsh-sp-iconBtn:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4d93f8));outline-offset:2px}
.dsh-sp-confirm{display:flex;align-items:center;gap:4px}
.dsh-sp-empty{display:flex;flex-direction:column;align-items:center;gap:6px;max-width:420px;margin:40px auto 0;padding:28px 20px;border:.5px dashed var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-panel,28px);text-align:center;color:var(--dsw-alias-label-secondary)}
.dsh-sp-emptyIcon{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:999px;background:var(--dsw-alias-bg-layer-2,#f0f0f0);color:var(--dsw-alias-label-secondary)}
.dsh-sp-emptyTitle{margin:0;color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:22px}
.dsh-sp-emptyBody{margin:0;font-size:12px;line-height:18px}
.dsh-sp-editor{display:flex;flex-direction:column;gap:10px;margin-top:20px}
.dsh-sp-editorBar{display:flex;align-items:center;justify-content:space-between;gap:8px}
.dsh-sp-editorMeta{color:var(--dsw-alias-label-tertiary,var(--dsw-alias-label-secondary));font-size:12px}
.dsh-sp-titleInput{box-sizing:border-box;width:100%;padding:8px 10px;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm,8px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:16px;font-weight:500;line-height:24px}
.dsh-sp-body{box-sizing:border-box;width:100%;min-height:320px;padding:12px;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md,12px);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;line-height:1.7;resize:vertical}
.dsh-sp-titleInput:focus,.dsh-sp-body:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}
.dsh-sp-editorActions{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
.dsh-sp-glyph{overflow:visible}
.dsh-sp-inkFrom{stop-color:var(--dsw-alias-brand-primary,#4D6BFE)}
.dsh-sp-inkMid{stop-color:#6C7BFF}
.dsh-sp-inkTo{stop-color:#8B5CF6}
.dsh-sp-glyphSheet{animation:dsh-sp-bob 3.6s ease-in-out infinite}
.dsh-sp-glyphFold{animation:dsh-sp-fold 3.6s ease-in-out infinite}
.dsh-sp-glyphLine{stroke-dasharray:1;stroke-dashoffset:0;animation:dsh-sp-write 5.6s ease-in-out infinite}
.dsh-sp-lineB{animation-delay:.22s}
.dsh-sp-glyph:hover .dsh-sp-glyphLine{animation-duration:1.6s}
@keyframes dsh-sp-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-.8px)}}
@keyframes dsh-sp-fold{0%,100%{opacity:.45}50%{opacity:1}}
@keyframes dsh-sp-write{0%,4%{stroke-dashoffset:1}18%,74%{stroke-dashoffset:0}88%,100%{stroke-dashoffset:1}}
@media (prefers-reduced-motion:reduce){.dsh-sp-glyphSheet,.dsh-sp-glyphFold,.dsh-sp-glyphLine{animation:none}.dsh-sp-glyphLine{stroke-dashoffset:0}}
.dsh-sp-tags{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.dsh-sp-tagsLabel{font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsh-sp-tag{display:inline-flex;align-items:center;gap:4px;padding:1px 8px;border-radius:999px;background:var(--dsw-alias-bg-layer-2,#f0f0f0);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.dsh-sp-tagSm{padding:0 7px;font-size:11px;line-height:16px}
.dsh-sp-tagX{border:0;background:transparent;color:inherit;font:inherit;font-size:13px;line-height:1;padding:0 0 1px 2px;cursor:pointer;opacity:.7}
.dsh-sp-tagX:hover{opacity:1;color:var(--dsw-alias-state-error-primary)}
.dsh-sp-tagInput{flex:1 1 120px;min-width:90px;padding:3px 8px;border:.5px dashed var(--dsw-alias-border-l1);border-radius:999px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px}
.dsh-sp-tagInput:focus{outline:none;border-color:var(--dsw-alias-brand-primary);border-style:solid}
.dsh-sp-section{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md,12px);background:var(--dsw-alias-bg-layer-1)}
.dsh-sp-sectionHead{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary)}
.dsh-sp-sectionActions{display:flex;gap:6px}
.dsh-sp-mini{border:.5px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:6px;padding:2px 8px;font:inherit;font-size:11.5px;cursor:pointer}
.dsh-sp-mini:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.dsh-sp-hint{margin:0;font-size:11.5px;color:var(--dsw-alias-label-tertiary);line-height:1.5}
.dsh-sp-todos{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.dsh-sp-todo{display:flex;align-items:flex-start;gap:8px;font-size:13px;line-height:1.6}
.dsh-sp-todo.is-done .dsh-sp-todoText{text-decoration:line-through;color:var(--dsw-alias-label-tertiary)}
.dsh-sp-check{margin-top:3px;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.dsh-sp-todoText{overflow-wrap:anywhere}
.dsh-sp-files{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.dsh-sp-file{display:flex;align-items:center;gap:8px}
.dsh-sp-thumbLink{flex:none;line-height:0}
.dsh-sp-thumb{width:56px;height:56px;object-fit:cover;border-radius:8px;border:.5px solid var(--dsw-alias-border-l1)}
.dsh-sp-fileGlyph{flex:none;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:8px;background:var(--dsw-alias-bg-layer-2,#f0f0f0);color:var(--dsw-alias-label-secondary);font-size:15px}
.dsh-sp-fileMeta{flex:1;min-width:0;display:flex;flex-direction:column;font-size:12px;line-height:1.45}
.dsh-sp-fileName{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-sp-fileSize{color:var(--dsw-alias-label-tertiary)}
.dsh-sp-filters{display:flex;flex-wrap:wrap;gap:6px;margin-top:16px}
.dsh-sp-filter{border:.5px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);border-radius:999px;padding:2px 10px;font:inherit;font-size:12px;cursor:pointer}
.dsh-sp-filter:hover{color:var(--dsw-alias-label-primary)}
.dsh-sp-filter.is-on{background:var(--dsw-alias-button-primary-fill);border-color:transparent;color:var(--dsw-alias-label-primary-foreground)}
.dsh-sp-itemTags{display:flex;flex-wrap:wrap;gap:4px;margin-top:2px}
.dsh-sp-notice{margin:14px 0 0;font-size:12px;color:var(--dsw-alias-state-error-primary)}
`

    /** Install the page stylesheet once; the returned cleanup removes this plugin's tag. */
    function installStyles() {
      const existing = document.querySelector(`style[data-plugin-css="${STYLE_TAG_ID}"]`)
      if (existing !== null) return () => {}
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-scratchpad'
      tag.dataset.pluginCss = STYLE_TAG_ID
      tag.textContent = css
      document.head.appendChild(tag)
      return () => {
        tag.remove()
      }
    }
    //#endregion

    //#region plugin body
    /** Client services this plugin cannot work without. */
    const inject = ['slots', 'locale']

    /**
     * Register the page and its sidebar entry. Both go through
     * `slot.inject`, so they come back if the owning declaration re-appears.
     *
     * @param ctx - Client root context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'scratchpad: dictionaries')
      ctx.effect(installStyles, 'scratchpad: page styles')

      const t = ctx.locale.bind(NS)
      /* The hook the page reads the active language from, so times follow it. */
      const localeHook = {
        getSnapshot: () => ctx.locale.getSnapshot(),
        subscribe: (listener) => ctx.locale.subscribe(listener),
      }

      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
        locale: NS,
        inject: () => ({
          /* Optional service: without the layout plugin the page still renders, minus the way back. */
          goConversation: () => {
            const layout = ctx.get('layout')
            if (layout !== undefined) layout.selectPanel(null)
          },
          hooks: { locale: localeHook },
        }),
      }, ScratchpadPage))

      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 20,
        locale: NS,
        label: () => t('panel.title'),
      }, ScratchpadIcon))
    }
    //#endregion

    return { inject, apply }
  },
})
