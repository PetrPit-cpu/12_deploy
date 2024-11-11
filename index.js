require('dotenv').config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const WebSocket = require("ws");

const app = express();

// Подключение к MongoDB
mongoose.connect(process.env.DB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("MongoDB connected"))
    .catch(err => console.error("MongoDB connection error:", err));

app.use(express.json());

// Определение схемы пользователей
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
});

const User = mongoose.model("User", userSchema);

// Определение схемы для таймеров
const timerSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isActive: { type: Boolean, default: true },
    description: String,
    start: Number,
    end: Number,
    progress: Number,
    duration: Number,
});

const Timer = mongoose.model("Timer", timerSchema);

// API для регистрации пользователя
app.post("/api/signup", async (req, res) => {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    try {
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();
        res.status(201).json({ sessionId: newUser._id });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// API для аутентификации
app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await User.findOne({ username });
        if (user && (await bcrypt.compare(password, user.password))) {
            res.json({ sessionId: user._id }); // Возвращаем sessionId
        } else {
            res.status(401).json({ error: "Invalid credentials" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// API для создания таймера
app.post("/api/timers", async (req, res) => {
    const { userId, description, duration } = req.body;
    const newTimer = new Timer({ user_id: userId, description, duration });
    try {
        await newTimer.save();
        // Уведомление клиентов о новом таймере
        broadcastAllTimers();
        res.status(201).json(newTimer);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// API для остановки таймера
app.post("/api/timers/:id/stop", async (req, res) => {
    const { id } = req.params;
    try {
        await Timer.findByIdAndUpdate(id, { isActive: false });
        // Уведомление клиентов о изменение таймера
        broadcastAllTimers();
        res.json({ message: "Timer stopped" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Веб-сокеты
const server = app.listen(process.env.PORT || 3000, () => {
    console.log(`Listening on http://localhost:${process.env.PORT}`);
});
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
    console.log("Client connected");

    // Аутентификация клиента (с учетом sessionId)
    ws.on("message", async (message) => {
        const { action, sessionId } = JSON.parse(message);
        if (action === "authenticate") {
            const user = await User.findById(sessionId);
            if (user) {
                // Отправка актуального списка таймеров после успешной аутентификации
                const timers = await Timer.find({ user_id: user._id });
                ws.send(JSON.stringify({ type: "all_timers", payload: timers }));
            } else {
                ws.send(JSON.stringify({ error: "Authentication failed" }));
            }
        }
    });

    // Периодическая отправка активных таймеров
    const timerInterval = setInterval(async () => {
        const timers = await Timer.find({ isActive: true });
        ws.send(JSON.stringify({ type: "active_timers", payload: timers }));
    }, 1000);

    ws.on("close", () => {
        console.log("Client disconnected");
        clearInterval(timerInterval);
    });
});

// Функция для широковещательной рассылки всем клиентам
const broadcastAllTimers = async () => {
    const allTimers = await Timer.find({});
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "all_timers", payload: allTimers }));
        }
    });
};
