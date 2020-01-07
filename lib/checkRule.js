const chalk = require('chalk')
const pathLib = require('path')
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
        ([...init, ...checkCode(regex, current)]), [])
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
  }

  if (!handler[type]) {
    console.log(chalk.red('unknown rule.type!\n', JSON.stringify(rule)))
    return false
  }

  return !!handler[type]()
}

module.exports = checkRule
