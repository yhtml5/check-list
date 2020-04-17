const fs = require('fs')
const path = require('path')
const shell = require('shelljs')

function checkCode(regular, appDirectory, ignore = []) {
  const paths = shell
    .ls('-lR', appDirectory)
    .filter(stat => stat.isFile())
    .filter((e) => !ignore.some((regexp) => regexp.test(e.name)))
    .map(stat => path.join(appDirectory, stat.name))

  if (process.env.DEBUG === 'true') {
    console.log('appDirectory', appDirectory)
    console.log('paths', paths)
  }

  return paths.filter(function (path, i) {
    const content = fs.readFileSync(path)
    const hasConflict = regular.test(content)
    if (hasConflict) {
      return path
    }
  })
}

module.exports = checkCode
