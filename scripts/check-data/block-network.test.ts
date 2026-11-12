// @vitest-environment node
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const preload = path.resolve(import.meta.dirname, 'block-network.cjs')
const run = (code: string) =>
  spawnSync(process.execPath, ['-e', code], {
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: `--require ${preload}` },
  })

describe('build:offline network guard', () => {
  it('blocks outbound fetch', () => {
    const r = run(
      "fetch('https://example.com').then(()=>console.log('REACHED'),e=>console.log('BLOCKED '+e.message))",
    )
    expect(r.stdout).toContain('BLOCKED')
    expect(r.stdout).not.toContain('REACHED')
  })
  it('allows loopback', () => {
    const r = run(
      "const s=require('http').createServer((q,x)=>x.end('ok')).listen(0,'127.0.0.1',()=>fetch('http://127.0.0.1:'+s.address().port).then(r=>r.text()).then(t=>{console.log(t);s.close()}))",
    )
    expect(r.stdout.trim()).toBe('ok')
  })
})
