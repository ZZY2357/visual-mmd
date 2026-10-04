// 部署脚本：构建并把 dist/ 作为一次独立（orphan）提交推送到 gh-pages 分支。
// 全程不切换工作区分支——用临时 index + commit-tree 直接生成提交。
import { execFileSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)))
const dist = join(repo, 'dist')
const branch = 'gh-pages'
const indexFile = join(repo, '.git', 'deploy-index.tmp')

const git = (args, extraEnv = {}) =>
  execFileSync('git', args, {
    cwd: repo,
    env: { ...process.env, ...extraEnv },
    encoding: 'utf8',
  }).trim()

try {
  if (!existsSync(join(dist, 'index.html'))) {
    console.error(`缺少 ${dist} 构建产物，请先 npm run build`)
    process.exit(1)
  }

  // 用临时 index 把 dist 内容收进一棵树，路径以 dist 为根；关掉 autocrlf 免去换行转换与警告
  const indexEnv = { GIT_INDEX_FILE: indexFile }
  git(['read-tree', '--empty'], indexEnv)
  git(['-c', 'core.autocrlf=false', 'add', '-A', '--'], {
    ...indexEnv,
    GIT_DIR: join(repo, '.git'),
    GIT_WORK_TREE: dist,
  })
  const tree = git(['write-tree'], indexEnv)

  // 与远端 gh-pages 现有内容一致时跳过，重复部署零开销
  let remoteTree
  try {
    remoteTree = git(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}^{tree}`])
  } catch {
    // 首次部署，远端还没有该分支
  }
  if (remoteTree === tree) {
    console.log(`dist 与 origin/${branch} 内容一致，跳过推送`)
    process.exit(0)
  }

  const sha = git(['rev-parse', '--short', 'HEAD'])
  const message = `deploy: build ${sha} (${new Date().toISOString().slice(0, 10)})`
  const commit = git(['commit-tree', tree, '-m', message])
  git(['push', 'origin', `${commit}:refs/heads/${branch}`, '--force'])
  console.log(`已部署 ${commit.slice(0, 10)} → origin/${branch}（来源 main@${sha}）`)
} finally {
  rmSync(indexFile, { force: true })
}
