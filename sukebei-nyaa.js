import AbstractSource from './abstract.js'
import { JSDOM } from 'jsdom'

const QUALITIES = ['2160', '1080', '720', '540', '480']

export default new class SukebeiNyaa extends AbstractSource {
  url = 'https://sukebei.nyaa.si'

  parseSize(sizeStr) {
    const match = sizeStr.match(/^([\d.]+)\s*([KMGT]?i?B)$/i)
    if (!match) return 0

    const size = parseFloat(match[1])
    const unit = match[2].toUpperCase()

    const map = {
      B: 1,
      KB: 1e3,
      KIB: 1024,
      MB: 1e6,
      MIB: 1024 ** 2,
      GB: 1e9,
      GIB: 1024 ** 3,
      TB: 1e12,
      TIB: 1024 ** 4
    }

    return Math.floor(size * (map[unit] ?? 1))
  }

  parseResults(html) {
    const dom = new JSDOM(html)
    const doc = dom.window.document

    const results = []
    const rows = doc.querySelectorAll('tbody tr')

    for (const row of rows) {
      const cells = row.querySelectorAll('td')
      if (cells.length < 7) continue

      const titleLink = cells[1].querySelector('a')
      if (!titleLink) continue

      const title = titleLink.textContent.trim()

      const links = [...cells[2].querySelectorAll('a')]
      const magnet = links.find(a => a.href.startsWith('magnet:'))
      const torrent = links.find(a => a.href.endsWith('.torrent'))

      const link = magnet?.href || (torrent ? this.url + torrent.href : null)
      if (!link) continue

      const size = this.parseSize(cells[3].textContent.trim())
      const seeders = Number(cells[5].textContent) || 0
      const leechers = Number(cells[6].textContent) || 0

      let hash = ''
      if (link.startsWith('magnet:')) {
        const m = link.match(/btih:([^&]+)/i)
        if (m) hash = m[1].toLowerCase()
      }

      results.push({
        title,
        link,
        size,
        seeders,
        leechers,
        downloads: 0,
        hash,
        accuracy: 'medium',
        date: new Date()
      })
    }

    return results
  }

  buildSearchQuery(titles, resolution, exclusions) {
    let q = titles[0] ?? ''

    if (resolution && QUALITIES.includes(resolution)) {
      q += ` ${resolution}p`
    }

    for (const ex of exclusions ?? []) {
      q += ` -${ex}`
    }

    return encodeURIComponent(q)
  }

  async performSearch(query, category = '1_0') {
    const url = `${this.url}/?f=0&c=${category}&q=${query}`

    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(res.status)
      return this.parseResults(await res.text())
    } catch {
      return []
    }
  }

  async single({ titles, episode, resolution, exclusions }) {
    if (!titles?.length) throw new Error('No titles')

    const qTitles = episode
      ? titles.map(t => `${t} ${String(episode).padStart(2, '0')}`)
      : titles

    const results = await this.performSearch(
      this.buildSearchQuery(qTitles, resolution, exclusions)
    )

    if (!episode) return results.slice(0, 20)

    const re = new RegExp(`\\b0?${episode}\\b`)
    return results.filter(r =>
      re.test(r.title.toLowerCase()) &&
      !r.title.toLowerCase().includes('batch')
    )
  }

  async batch({ titles, episodeCount, resolution, exclusions }) {
    if (!titles?.length) throw new Error('No titles')

    const results = await this.performSearch(
      this.buildSearchQuery(
        titles.map(t => `${t} batch`),
        resolution,
        exclusions
      )
    )

    return results
      .filter(r =>
        /batch|complete/i.test(r.title) ||
        (episodeCount && r.title.includes(`1-${episodeCount}`))
      )
      .slice(0, 10)
      .map(r => ({ ...r, type: 'batch' }))
  }

  async movie({ titles, resolution, exclusions }) {
    if (!titles?.length) throw new Error('No titles')

    const results = await this.performSearch(
      this.buildSearchQuery(titles, resolution, exclusions)
    )

    return results
      .filter(r =>
        !/\b(s\d+|season|ep\d+|\d+x\d+)\b/i.test(r.title) &&
        !r.title.toLowerCase().includes('batch')
      )
      .slice(0, 15)
  }

  async test() {
    try {
      return (await fetch(this.url)).ok
    } catch {
      return false
    }
  }
}()
