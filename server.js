const express = require('express');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());

// 从环境变量读取敏感信息
const API_BASE_URL = 'https://api.itniotech.com';
const API_KEY = process.env.API_KEY || 'tHdCLW9R3Cgfd8HdNaw3xAeKRJUfH9NQ';
const API_SECRET = process.env.API_SECRET || 'oDCYdY24XcYHBMRRLAHXf0Fazq4PkjvT';

// ========== 心跳配置 ==========
// 每 10 分钟给自己发送一次请求，防止 Render 休眠
const HEARTBEAT_INTERVAL = 10 * 60 * 1000; // 10分钟（Render 是 15 分钟休眠，10分钟足够安全）
let heartbeatInterval = null;

// 签名函数
function generateSign(timestamp, requestBody) {
    let params = {
        'Api-Key': API_KEY,
        'Timestamp': timestamp
    };
    
    for (let key in requestBody) {
        if (requestBody.hasOwnProperty(key)) {
            params[key] = requestBody[key];
        }
    }
    
    const sortedKeys = Object.keys(params).sort();
    const stringToSign = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
    
    const hmac = crypto.createHmac('sha256', API_SECRET);
    hmac.update(stringToSign);
    return hmac.digest('hex');
}

// 心跳接口（用于外部监控，也可内部调用）
app.get('/ping', (req, res) => {
    res.json({ 
        status: 'alive', 
        timestamp: Date.now(),
        uptime: process.uptime()
    });
});

// 发送验证码的接口
app.post('/api/send-code', async (req, res) => {
    const { phone } = req.body;
    
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) {
        return res.status(400).json({ error: '请输入正确的11位手机号' });
    }
    
    const timestamp = Math.floor(Date.now() / 1000);
    const requestBody = { mobile: phone };
    const sign = generateSign(timestamp, requestBody);
    
    const headers = {
        'Content-Type': 'application/json;charset=UTF-8',
        'Api-Key': API_KEY,
        'Timestamp': String(timestamp),
        'Sign': sign
    };
    
    try {
        const apiPath = '/api/v1/sms/sendCode';
        const response = await fetch(`${API_BASE_URL}${apiPath}`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
        });
        
        const data = await response.json();
        res.status(response.status).json(data);
        
    } catch (error) {
        console.error('代理请求失败:', error);
        res.status(500).json({ error: '服务端请求失败', message: error.message });
    }
});

// 健康检查接口
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: Date.now(),
        heartbeat: heartbeatInterval !== null ? 'running' : 'stopped'
    });
});

// 启动心跳（仅在非本地开发环境或显式启用）
function startHeartbeat() {
    // 获取本机部署的 URL（需要从环境变量读取）
    const selfUrl = process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL;
    
    if (!selfUrl) {
        console.log('⚠️ 未设置 SELF_URL 环境变量，心跳功能未启动');
        console.log('💡 提示: 在 Render 环境变量中添加 SELF_URL = https://你的服务名.onrender.com');
        return;
    }
    
    console.log(`❤️ 心跳已启用，目标: ${selfUrl}/ping`);
    console.log(`⏰ 每 ${HEARTBEAT_INTERVAL / 1000} 秒发送一次心跳`);
    
    // 立即执行一次
    const pingSelf = async () => {
        try {
            const response = await fetch(`${selfUrl}/ping`);
            if (response.ok) {
                console.log(`❤️ 心跳成功 ${new Date().toLocaleTimeString()}`);
            } else {
                console.log(`⚠️ 心跳响应异常: ${response.status}`);
            }
        } catch (error) {
            console.log(`❌ 心跳失败: ${error.message}`);
        }
    };
    
    // 立即执行一次
    pingSelf();
    
    // 定时执行
    heartbeatInterval = setInterval(pingSelf, HEARTBEAT_INTERVAL);
}

// 优雅关闭
process.on('SIGTERM', () => {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
    }
    process.exit(0);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`环境: ${process.env.NODE_ENV || 'development'}`);
    
    // 尝试启动心跳（需要环境变量）
    startHeartbeat();
});