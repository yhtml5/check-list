const inquirer = require('inquirer')

const askQuestion = ({ questions }) =>
    inquirer.prompt([
        { name: 'remind', type: 'confirm', message: 'Do you need to be reminded' },
    ]).then(function (answers) {
        if (answers.remind) {
            const _questions = questions.map((question, index) => ({
                name: String(index),
                type: 'confirm',
                message: question
            }))
            return inquirer
                .prompt(_questions)
                .then(function (answers) {
                    const ok = !Object.values(answers).includes(false)
                    return ok
                })
        }
        return true
    })

const timer = async time => new Promise(function (resolve, reject) {
    setTimeout(resolve, time)
})

const printQuestion = async ({
    questions,
    questionInterval,
    questionTitle,
}) => {
    let count = 0
    let countDownSecond = (questionInterval / 1000) - 2
    const getCountDownText = second => questionTitle
        ? `  ${questionTitle} ${second} 秒`
        : `  Please read carefully: ${second} second`

    const countDown = setInterval(() => {
        try {
            process.stdout.clearLine()
            process.stdout.cursorTo(0)
            process.stdout.write(getCountDownText(countDownSecond))
            countDownSecond--
        } catch (error) {

        }
    }, 1000)
    console.log()
    console.log('Check list questions: ')
    for (const question of questions) {
        console.log(`  ${count}. ${question}`)
        count++
    }
    console.log()
    await timer(questionInterval)

    clearInterval(countDown)
    console.log()
    return true
}

const ask = options =>
    options.questionInterval
        ? printQuestion(options)
        : askQuestion(options)


module.exports = ask
