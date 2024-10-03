const fs = require('fs');
const path = require('path');
const axios = require('axios');
const readline = require('readline');
const colors = require('colors');
const { parse } = require('querystring');
const { DateTime } = require('luxon');

class To {
    constructor() {
        this.headers = {
            "Accept": "application/json, text/plain, */*",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Accept-Language": "en-GB,en;q=0.9,en-US;q=0.8,ja;q=0.7",
            "Content-Type": "application/json",
            "Origin": "https://mini-app.tomarket.ai",
            "Referer": "https://mini-app.tomarket.ai/",
            "Sec-Ch-Ua": '"Microsoft Edge";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0"
        };

        this.loginUrl = 'https://api-web.tomarket.ai/tomarket-game/v1/user/login';
        this.balanceUrl = 'https://api-web.tomarket.ai/tomarket-game/v1/user/balance';
        this.dailyClaimUrl = 'https://api-web.tomarket.ai/tomarket-game/v1/daily/claim';
        this.startFarmingUrl = 'https://api-web.tomarket.ai/tomarket-game/v1/farm/start';
        this.endFarmingUrl = 'https://api-web.tomarket.ai/tomarket-game/v1/farm/claim';
        this.startPlayGameUrl = 'https://api-web.tomarket.ai/tomarket-game/v1/game/play';
        this.endPlayGameUrl = 'https://api-web.tomarket.ai/tomarket-game/v1/game/claim';

        this.interval = 3;
        this.gameLowPoint = 300;
        this.gameHighPoint = 450;
    }

    log(msg, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        switch(type) {
            case 'success':
                console.log(`[${timestamp}] [*] ${msg}`.green);
                break;
            case 'custom':
                console.log(`[${timestamp}] [*] ${msg}`.magenta);
                break;        
            case 'error':
                console.log(`[${timestamp}] [!] ${msg}`.red);
                break;
            case 'warning':
                console.log(`[${timestamp}] [*] ${msg}`.yellow);
                break;
            default:
                console.log(`[${timestamp}] [*] ${msg}`);
        }
    }

    async countdown(t) {
        for (let i = t; i > 0; i--) {
            const hours = String(Math.floor(i / 3600)).padStart(2, '0');
            const minutes = String(Math.floor((i % 3600) / 60)).padStart(2, '0');
            const seconds = String(i % 60).padStart(2, '0');
            process.stdout.write(colors.white(`[*] Cần chờ ${hours}:${minutes}:${seconds}     \r`));
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        process.stdout.write('                                        \r');
    }

    async login(initData, token) {
        let payLoad = JSON.stringify({
            "init_data": initData,
            "invite_code": "",
            "from": "",
            "is_bot": false
        })

        try {
            const response = await axios.post(this.loginUrl, payLoad, { headers: {...this.headers, 'authorization': `${token}`} });
            return response.data.status == 0 ? response.data.data : null;
        } catch (error) {
            this.log(error.message, 'error');
            return null;
        }
    }

    async startClaim(accessToken) {
        try {
            while (true) {
                const response = await axios.post(this.balanceUrl, {}, { headers: { ...this.headers, 'authorization': `${accessToken}` } });
                const data = response.data.data;
    
                if (!data) {
                    this.log('Không thể lấy thông tin balance!', 'error');
                    return null;
                }
    
                const timestamp = data.timestamp;
                const balance = data.available_balance;
    
                this.log(`Balance: ${balance}`, 'success');
                if (!data.daily) {
                    await this.dailyClaim(accessToken);
                    continue;
                }
    
                const lastCheckTs = data.daily.last_check_ts;
                if (DateTime.now().toSeconds() > lastCheckTs + 24 * 60 * 60) {
                    await this.dailyClaim(accessToken);
                    continue;
                }
    
                if (!data.farming) {
                    this.log('Chưa bắt đầu farming', 'info');
                    await this.startFarming(accessToken);
                    continue;
                }
    
                const endFarming = data.farming.end_at * 1000;
                const countdown = data.farming.end_at;
                const formatEndFarming = DateTime.fromMillis(endFarming).toISO().split('.')[0];
                if (timestamp * 1000 > endFarming) {
                    await this.endFarming(accessToken);
                    continue;
                }
    
                this.log(`Farming kết thúc vào: ${formatEndFarming}`, 'info');
                const playPass = data.play_passes;
                this.log(`Số lượt chơi: ${playPass}`, 'info');
                if (parseInt(playPass) > 0) {
                    await this.playGameFunc(playPass, accessToken);
                    continue;
                }
                let next = countdown - timestamp;
                next += 120;
                return next;
            }
        } catch (error) {
            this.log(`Lỗi lấy thông tin startClaim ${error.message}`, 'error');
            return null;
        }
    }

    async dailyClaim(accessToken) {
        let payLoad = JSON.stringify({
            'game_id': 'fa873d13-d831-4d6f-8aee-9cff7a1d0db1'
        });

        const res = await axios.post(this.dailyClaimUrl, payLoad, { headers: { ...this.headers, 'authorization': `${accessToken}` } });

        if (res.status !== 200) {
            this.log('Không thể điểm danh hàng ngày!', 'error');
            return false;
        }

        const response = res.data.data;
        if (typeof response === 'string') {
            return false;
        }

        const point = response.today_points;
        this.log(`Điểm danh hàng ngày thành công! Số điểm nhận được: ${point}`, 'success');
        return true;
    }

    async startFarming(accessToken) {
        let payLoad = JSON.stringify({
            'game_id': '53b22103-c7ff-413d-bc63-20f6fb806a07'
        });

        const res = await axios.post(this.startFarmingUrl, payLoad, { headers: { ...this.headers, 'authorization': `${accessToken}` } });

        if (res.status !== 200) {
            this.log('Không thể bắt đầu farming!', 'error');
            return false;
        }

        const endFarming = res.data.data.end_at;
        const formatEndFarming = DateTime.fromMillis(endFarming).toISO().split('.')[0];
        this.log('Bắt đầu farming...', 'info');
    }

    async endFarming(accessToken) {
        const data = JSON.stringify({ game_id: '53b22103-c7ff-413d-bc63-20f6fb806a07' });
        const res = await axios.post(this.endFarmingUrl, data, { headers: { ...this.headers, 'authorization': `${accessToken}` } });

        if (res.status !== 200) {
            this.log('Không thể thu hoạch cà chua!', 'error');
            return false;
        }

        const poin = res.data.data.claim_this_time;
        this.log(`Thu hoạch thành công! Số điểm nhận được: ${poin}`, 'success');
        return true;
    }

    async playGameFunc(amountPass, accessToken) {
        for (let i = 0; i < amountPass; i++) {
            const resStart = await this.startPlayGame(accessToken);
            if (!resStart) {
                return false;
            }

            this.log(`Bắt đầu chơi game lần ${i + 1}`, 'info');
            await this.countdown(30);

            const point = this.randomInt(this.gameLowPoint, this.gameHighPoint);
            const dataClaim = JSON.stringify({ game_id: '59bcd12e-04e2-404c-a172-311a0084587d', points: point });

            const resClaim = await axios.post(this.endPlayGameUrl, dataClaim, { headers: { ...this.headers, 'authorization': `${accessToken}` } });
            if (resClaim.status !== 200) {
                this.log('Không thể nhận điểm từ game!', 'error');
                continue;
            }

            this.log(`Nhận điểm thành công! Số điểm nhận được: ${point}`, 'success');
        }
    }

    async startPlayGame(accessToken) {
        const data = JSON.stringify({ game_id: '59bcd12e-04e2-404c-a172-311a0084587d' });
        const res = await axios.post(this.startPlayGameUrl, data, { headers: { ...this.headers, 'authorization': `${accessToken}` } });

        if (res.status !== 200) {
            this.log('Không thể bắt đầu chơi game!', 'error');
            return null;
        }

        return res.data.data;
    }

    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    async main() {
        const dataFile = path.join(__dirname, 'data.txt');
        const data = fs.readFileSync(dataFile, 'utf8')
            .replace(/\r/g, '')
            .split('\n')
            .filter(Boolean);

        const dataFileToken = path.join(__dirname, 'token.txt');
        const dataToken = fs.readFileSync(dataFileToken, 'utf8')
            .replace(/\r/g, '')
            .split('\n')
            .filter(Boolean);
        
        while (true) {
            const listCountdown = [];
            const start = Math.floor(Date.now() / 1000);
            for (let i = 0; i < data.length; i++) {
                const queryString = data[i];
                const tokenLogin = dataToken[i];
                const userData = JSON.parse(decodeURIComponent(queryString.split('user=')[1].split('&')[0]));
                const firstName = userData.first_name;
                console.log(`========== Tài khoản ${i + 1} | ${firstName.green} ==========`);

                const authTokens = await this.login(queryString, tokenLogin);

                if (authTokens) {
                    console.log(`${authTokens.fn.green} ${authTokens.ln.green} Đăng nhập thành công!`);
                    let accessToken = authTokens.access_token;
                    const result = await this.startClaim(accessToken);

                    await this.countdown(this.interval);
                    listCountdown.push(result);
                } else {
                    this.log('Đăng nhập thất bại!', 'error');
                }
            }

            const end = Math.floor(Date.now() / 1000);
            const total = end - start;
            const min = Math.min(...listCountdown) - total;
            await this.countdown(min);
        }
    }
}

const client = new To();
client.main().catch(err => {
    client.log(err.message, 'error');
    process.exit(1);
});