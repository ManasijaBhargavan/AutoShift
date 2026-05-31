import fs from 'fs/promises'
import bcrypt from 'bcrypt'

const LOGIN_PATH = '/home/anthony_m/Documents/personalProj/AutoShift/public/login.json';

const loginTxt = await fs.readFile(LOGIN_PATH, 'utf8');
const loginData = JSON.parse(loginTxt);

for (var i in loginData){
    for (var j in loginData[i]){
        var temp = loginData[i][j]
        console.log(`Plain Text Password: ${temp["password"]}`)
        temp["password"] = await bcrypt.hash(temp["password"], 12)
        console.log(`Hashed Password: ${temp["password"]}`)
    }
}

const output = JSON.stringify(loginData, null, 2)
fs.writeFile('login_hashed.json', output, 'utf8')