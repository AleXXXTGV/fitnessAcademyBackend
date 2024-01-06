const express = require('express');
const multer = require('multer');
const mysql = require('mysql');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const fs = require('fs');
// Создание папки для загрузки, если она еще не существует
const uploadFolder = './uploads';
if (!fs.existsSync(uploadFolder)) {
    fs.mkdirSync(uploadFolder);
}

function calculateEndDate(startDate, type) {
    const endDate = new Date(startDate);
    if (type === 'month') {
        endDate.setMonth(endDate.getMonth() + 1);
    } else if (type === 'year') {
        endDate.setFullYear(endDate.getFullYear() + 1);
    }
    return endDate;
}

function calculateRemainingDays(endDate) {``
    const today = new Date();
    return Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
}

const app = express();
app.use(bodyParser.json());
app.use('/uploads', express.static('uploads'));
const saltRounds = 10;

// Настройка CORS
app.use(cors());
// CORS options
const corsOptions = {
    origin: 'http://localhost:8080', // Разрешить доступ с вашего клиентского порта
    optionsSuccessStatus: 200
};
// Использование CORS для определенных маршрутов
app.use('/uploads', cors(corsOptions)); // Разрешить CORS для маршрута /uploads

// Подключение к MySQL
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'fitnessacademytest'
});

db.connect((err) => {
    if (err) {
        console.error('Ошибка при подключении к базе данных:', err);
    } else {
        console.log('Успешное подключение к базе данных');
    }
});

function generateRandomPassword(length = 10) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
    let password = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * characters.length);
        password += characters[randomIndex];
    }
    return password;
}

// Настройка хранилища для multer
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/') // путь, где будут сохраняться файлы (например, в папке uploads)
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, file.fieldname + '-' + uniqueSuffix) // создание уникального имени файла
    }
});

const upload = multer({ storage: storage });

// Маршрут для загрузки
app.post('/upload', upload.single('image'), (req, res) => {
    const file = req.file;
    if (!file) {
        return res.status(400).send('No file uploaded.');
    }

    const query = "INSERT INTO images (filename, path) VALUES (?, ?)";
    db.query(query, [file.filename, file.path], (err, result) => {
        if (err) {
            return res.status(500).send('Database error.');
        }
        res.send('File uploaded and saved in database.');
    });
});

app.post('/createUser', upload.single('avatar'), async (req, res) => {
    try {
        let {
            fullName,
            phoneNumber,
            birthDate,
            gender,
            subscriptionData, // Данные абонемента
            trainer,
            schedule,
            paymentType,
            totalAmount,
            paidAmount,
            visits
        } = req.body;
        // Преобразование данных абонемента из JSON
        let subscription = JSON.parse(subscriptionData);

        // Добавление дополнительных полей к абонементу
        subscription.isFrozen = false; // По умолчанию абонемент не заморожен
        subscription.startDate = new Date(subscription.startDate || new Date()); // Если дата не указана, используется текущая
        subscription.endDate = calculateEndDate(subscription.startDate, subscription.type);
        subscription.remainingDays = calculateRemainingDays(subscription.endDate);

        // Генерация и хеширование пароля
        let randomPassword = generateRandomPassword();
        let hashedPassword = await bcrypt.hash(randomPassword, saltRounds);

        let avatarPath = req.file ? req.file.path : null; // Путь к файлу, если он был загружен

        // Создание пользователя с хешированным паролем и другими данными
        let createUserQuery = 'INSERT INTO users (fullName, phoneNumber, birthDate, gender, subscription, trainer, schedule, paymentType, totalAmount, paidAmount, visits, hashedPassword, avatar) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        db.query(createUserQuery, [fullName, phoneNumber, birthDate, gender, JSON.stringify(subscription), JSON.stringify(trainer), schedule, paymentType, totalAmount, paidAmount, JSON.stringify(visits), hashedPassword, avatarPath], (err, result) => {
            if (err) {
                console.error('Ошибка при создании пользователя:', err);
                res.status(500).send('Ошибка при создании пользователя');
                return;
            }

            // Получение ID пользователя
            let userId = result.insertId;

            // Отправка ID, пароля и пути к аватару
            res.json({ userId, password: randomPassword, avatar: avatarPath });
        });
    } catch (error) {
        console.error('Ошибка сервера:', error);
        res.status(500).send('Ошибка сервера');
    }
});

app.post('/adminLogin', (req, res) => {
    const { phone, password } = req.body;

    if (!phone || !password) {
        return res.status(400).send('Phone and password are required');
    }

    const query = 'SELECT * FROM admin WHERE phone = ? AND password = ?';
    db.query(query, [phone, password], (err, results) => {
        if (err) {
            return res.status(500).send('Error on the server.');
        }
        if (results.length > 0) {
            res.send(true);
        } else {
            res.send(false);
        }
    });
});

// GET маршрут для таблицы trainers
app.get('/trainers', (req, res) => {
    db.query('SELECT * FROM trainers', (err, results) => {
        if (err) {
            res.status(500).send('Server error');
            return;
        }
        const parsedResults = results.map(trainer => {
            return {
                ...trainer,
                prices: JSON.parse(trainer.prices)
            };
        });
        res.json(parsedResults);
    });
});

app.get('/subscriptions', (req, res) => {
    db.query('SELECT * FROM subscriptions', (err, results) => {
        if (err) {
            res.status(500).send('Server error');
            return;
        }
        const parsedResults = results.map(subscription => {
            return {
                ...subscription,
                prices: JSON.parse(subscription.prices)
            };
        });
        res.json(parsedResults);
    });
});


const port = 3000;
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
