const chalk = require('chalk')
const pathLib = require('path')
const childProcess = require('child_process')
const checkCode = require('./checkCode')
const getDirSize = require('./getDirSize')
const checkRequiredFiles = require('./checkRequiredFiles')
const getFilesPath = require('./getFilesPath')
const checkVueScoped = require('./checkVueScoped')
const shell = require('shelljs')
const fs = require('fs')
const crypto = require('crypto')

/**
 * check rule
 * @param { Object } rule
 */
function checkRule(rule) {
  const {
    type = '',
    describe = '',
    paths = [],
    regex = /^!@#$/,
    min = 0,
    max = Infinity,
    index = 0,
    disableExt = [],
    ignore = [],
    branch = 'master', // string | [string, string]
  } = rule || {}
  const consoleSuccess = ({ sizeText = '' } = {}) =>
    console.log(chalk.green(`  ${index}.${describe}:`), chalk.blue(`success! ${sizeText}`))
  const consoleFail = (num = 1) =>
    console.log(chalk.red(`  ${index}.${describe}:`), chalk.red(`${num} failed!`))

  const handler = {
    title() {
      console.log(chalk.green('Check List Rules:'))
      return true
    },
    vueScoped() {
      // 扁平化数组
      const checkFiles = paths.reduce((init, current) => ([...init, ...getFilesPath(current)]), [])
      const vueFiles = checkFiles.filter((path) => /\.vue/.test(path))
      const failedPaths = vueFiles.filter((path) => checkVueScoped(path))
      if (failedPaths.length) {
        consoleFail(failedPaths.length)
        console.log(chalk.red('    failedPaths:\n'), failedPaths)
      } else {
        consoleSuccess()
      }
      if (process.env.DEBUG === 'true') {
        console.log({
          paths,
          checkFiles,
          vueFiles,
          failedPaths,
        })
      }
      return failedPaths.length === 0
    },
    regex() {
      const failedPaths = paths.reduce((init, current) =>
        ([...init, ...checkCode(regex, current, ignore)]), [])
      if (failedPaths.length) {
        consoleFail(failedPaths.length)
        console.log(chalk.green('    regex:', regex))
        console.log(chalk.green('    failedPaths:\n'), failedPaths)
      } else {
        consoleSuccess()
      }
      // const customCheckCodeOk = customCheckCodeResults.every(result => result.failPaths.length === 0)
      return failedPaths.length === 0
    },
    require() {
      const hasRequiredFiles = checkRequiredFiles(paths)
      hasRequiredFiles ? consoleSuccess() : consoleFail()
      return !!hasRequiredFiles
    },
    limit() {
      const size = paths.reduce((init, current) => init + getDirSize(current), 0)
      const sizeText = `${size / 1000}kb`
      if (size > max * 1024) {
        consoleFail()
        console.log(chalk.red('    getDirSize:', sizeText))
        console.log(chalk.red('    limit max:', `${max}kb`))
        return false
      } else if (size < min * 1024) {
        consoleFail()
        console.log(chalk.red('    getDirSize:', sizeText))
        console.log(chalk.red('    limit min:', `${min}kb`))
        return false
      } else {
        consoleSuccess({ sizeText })
        return true
      }
    },
    ext() {
      const problemFiles = []

      shell.find(paths).forEach(item => {
        const ext = pathLib.extname(item)
        if (disableExt.indexOf(ext) !== -1) problemFiles.push(item)
      })

      if (problemFiles.length) {
        consoleFail(problemFiles.length)
        console.log(chalk.green('    failedPaths:\n'), problemFiles)
        return
      } else {
        consoleSuccess()
        return true
      }
    },
    md5() {
      // 要求 paths 格式： [ { path: '', md5: '' }, ... ]
      for (const item of paths) {
        if (typeof item !== 'object' || !item.path || !item.md5) {
          consoleFail()
          console.log(chalk.red('    invalid rule path: '), item)
          return false
        }
        if (!fs.existsSync(item.path)) {
          consoleFail()
          console.log(chalk.red('    file not exists:\n', item.path))
          return false
        }

        const content = fs.readFileSync(item.path)
        const md5 = crypto.createHash('md5').update(content).digest('hex')
        if (md5 !== item.md5) {
          consoleFail()
          console.log(chalk.red('    md5 not match:\n', `current ${md5} => expect ${item.md5}`))
          return false
        }
      }
      consoleSuccess()
      return true
    },
    git() {
      let sourceBranch = null
      let targetBranch = 'master'
      if (typeof branch === 'string') {
        targetBranch = branch
      } else if (branch) {
        targetBranch = branch[0] || null
        sourceBranch = branch[1] || null
      }
      if (!targetBranch) {
        consoleFail()
        console.log(chalk.red('    配置错误: 未指定目标分支'))
        return false
      }
      console.log(chalk.gray('    [checklist/git]检查目标分支是否存在...'))
      const checkTargetBranch = childProcess.execSync(`git ls-remote --heads origin ${targetBranch}`).toString()
      if (!checkTargetBranch) {
        // 检查目标分支是否存在
        consoleFail()
        console.log(chalk.red(`    [checklist/git]目标分支不存在: ${targetBranch}`))
        return false
      }
      const currentBranchName = childProcess.execSync('git branch --show-current').toString().replace(/\r?\n/g, '')
      if (!sourceBranch) {
        // 如果没有源分支, 获取当前所处分支作为源分支
        sourceBranch = currentBranchName
      }
      if (currentBranchName !== sourceBranch) {
        // 如果有源分支, 当前是否处在源分支
        consoleFail()
        console.log(chalk.red(`    [checklist/git]未处在源分支: need ${sourceBranch} but got ${currentBranchName}`))
        return false
      }
      console.log(chalk.gray('    [checklist/git]从 origin fetch 最新的目标分支...'))
      // fetch最新的目标分支
      childProcess.execSync(`git fetch origin ${targetBranch}`).toString()
      // 获取目标远程分支的头部hash(比如master下最新提交的hash)
      const targetHeadHash = childProcess.execSync(`git rev-parse origin/${targetBranch}`).toString().replace(/\r?\n/g, ' ')
      try {
        // 获取源分支下是否包含目标hash的提交
        const containsHash = childProcess.execSync(`git branch ${sourceBranch} --contains ${targetHeadHash}`).toString().replace(/\r?\n/g, ' ')
        // 获取到为空说明不包含
        if (!/\*\s.+/.test(containsHash)) {
          consoleFail()
          console.log(chalk.red(`    [checklist/git]master下有更新, head为: ${targetHeadHash}; containsHash got: ${containsHash}`))
          return false
        }
      } catch(e) {
        // 获取出错了也说明不包含
        consoleFail()
        console.log(chalk.red(`    [checklist/git]master下有更新, head为: ${targetHeadHash}`))
        return false
      }
      console.log(chalk.gray(`    [checklist/git]${targetBranch}下最新提交为: ${targetHeadHash}, ${sourceBranch}下包含该提交.`))
      consoleSuccess()
      return true
    },
  }

  if (!handler[type]) {
    console.log(chalk.red('unknown rule.type!\n', JSON.stringify(rule)))
    return false
  }

  return !!handler[type]()
}

module.exports = checkRule
