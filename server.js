const express = require('express');
const multer = require('multer');
const mysql = require('mysql');
const cron = require('node-cron');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const fs = require('fs');
const app = express();

app.use(cors());
// Создание папки для загрузки, если она еще не существует
const uploadFolder = '../frontend/src/assets/images';
if (!fs.existsSync(uploadFolder)) {
    fs.mkdirSync(uploadFolder);
}

function calculateEndDate(startDate, type, count) {
    const endDate = new Date(startDate);
    if (type === 'day') {
        endDate.setDate(endDate.getDay() + count);
    } else if (type === 'month') {
        endDate.setMonth(endDate.getMonth() + count);
    } else if (type === 'year') {
        endDate.setFullYear(endDate.getFullYear() + count);
    }
    return endDate;
}
// Функция для расчета оставшихся дней
function calculateRemainingDays(endDate) {
    const today = new Date();
    const end = new Date(endDate);
    return Math.ceil((end - today) / (1000 * 60 * 60 * 24));
}

app.use(bodyParser.json());
app.use('/uploads', express.static('uploads'));
const saltRounds = 10;

// Подключение к MySQL
const db = mysql.createConnection({
    // host: 'localhost',
    // user: 'root',
    // password: '',
    // database: 'fitnessacademytest'
    host: '178.250.159.22',
    user: 'gymsys_inexb',
    password: 'WrxeEXhziGLAI1Dd',
    database: 'gymsys_inexb'
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

function convertStringToNumber(str) {
    if (typeof str === 'string') {
        return parseInt(str.replace(/\s/g, ''), 10);
    }
    return NaN; // Возвращаем NaN, если str не строка
}

// Запланированное задание, которое выполняется каждый день в полночь
cron.schedule('0 0 * * *', function() {
    console.log('Выполняется ежедневное обновление данных подписки и тренера.');

    db.query('SELECT id, subscription, trainer FROM users', (err, results) => {
        if (err) {
            // Обработка ошибок
            return;
        }

        results.forEach(user => {
            let subscription = JSON.parse(user.subscription);
            let trainer = JSON.parse(user.trainer);

            // Обновление remainingDays
            subscription.remainingDays = calculateRemainingDays(subscription.endDate);
            trainer.remainingDays = calculateRemainingDays(trainer.endDate);

            // Обновление записей в базе данных
            db.query('UPDATE users SET subscription = ?, trainer = ? WHERE id = ?', 
                [JSON.stringify(subscription), JSON.stringify(trainer), user.id], (err, updateResults) => {
                    if (err) {
                        // Обработка ошибок
                        return;
                    }
                    console.log(`Обновлены данные пользователя с ID ${user.id}`);
                }
            );
        });
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
            visits,
            userDateOfPurchase
        } = req.body;
        // Преобразование данных абонемента из JSON
        let subscription = JSON.parse(subscriptionData);
        // Добавление дополнительных полей к абонементу
        subscription.isFrozen = false; // По умолчанию абонемент не заморожен
        console.log(userDateOfPurchase);
        subscription.userDateOfPurchase = new Date(userDateOfPurchase || new Date()); // Если дата не указана, используется текущая
        subscription.endDate = calculateEndDate(userDateOfPurchase, subscription.type, subscription.count);
        subscription.remainingDays = calculateRemainingDays(subscription.endDate);
        console.log(subscription);
        
        let trainerData = JSON.parse(trainer);
        // Добавление дополнительных полей к абонементу
        trainerData.isFrozen = false; // По умолчанию абонемент не заморожен
        trainerData.userDateOfPurchase = new Date(userDateOfPurchase || new Date()); // Если дата не указана, используется текущая
        trainerData.endDate = calculateEndDate(userDateOfPurchase, trainerData.type, trainerData.count);
        trainerData.remainingDays = calculateRemainingDays(trainerData.endDate);
        console.log(trainerData);
        // Генерация и хеширование пароля
        let randomPassword = generateRandomPassword();
        let hashedPassword = await bcrypt.hash(randomPassword, saltRounds);

        let avatarPath = req.file ? req.file.path : null; // Путь к файлу, если он был загружен
        trainer = JSON.parse(trainer)
        visits = JSON.parse(visits)

        let paidAmountArr = [];
        let totalAmountArr = [];

        if (typeof paidAmount === 'string') {
            paidAmount = convertStringToNumber(paidAmount);
            paidAmountArr.push(paidAmount);
        }

        if (typeof totalAmount === 'string') {
            totalAmount = convertStringToNumber(totalAmount);
            totalAmountArr.push(totalAmount);
        }
        // Создание пользователя с хешированным паролем и другими данными
        let createUserQuery = 'INSERT INTO users (fullName, phoneNumber, birthDate, gender, subscription, trainer, schedule, paymentType, totalAmount, paidAmount, visits, hashedPassword, avatar) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        db.query(createUserQuery, [fullName, phoneNumber, birthDate, gender, JSON.stringify(subscription), JSON.stringify(trainerData), schedule, paymentType, JSON.stringify(totalAmountArr), JSON.stringify(paidAmountArr), JSON.stringify(visits), hashedPassword, avatarPath], (err, result) => {
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

function safeJSONParse(data) {
    try {
        return JSON.parse(data);
    } catch (e) {
        console.error('Ошибка при парсинге данных:', e);
        return null; // или установите значение по умолчанию
    }
}

app.get('/searchUser', (req, res) => {
    const { searchQuery } = req.query;

    if (!searchQuery.trim()) {
        res.status(400).send('Пустой запрос поиска');
        return;
    }

    const searchQueryNumber = parseInt(searchQuery, 10);
    const isNumericSearchQuery = !isNaN(searchQueryNumber);

    const query = `SELECT * FROM users WHERE id = ? OR fullName = ? OR phoneNumber = ?`;

    // Используем searchQuery как число для id, если это возможно, иначе используем его как строку
    const queryParams = [isNumericSearchQuery ? searchQueryNumber : searchQuery, searchQuery, searchQuery];


    db.query(query, queryParams, (err, results) => {
        if (err) {
            res.status(500).send('Ошибка сервера');
            return;
        }

        if (results.length > 0) {
            let users = results.map(user => {
                return {
                    ...user,
                    subscription: safeJSONParse(user.subscription),
                    trainer: safeJSONParse(user.trainer),
                    visits: safeJSONParse(user.visits),
                    paidAmount: safeJSONParse(user.paidAmount),
                    totalAmount: safeJSONParse(user.totalAmount),
                };
            });
            users[0].trainer = JSON.parse(results[0].trainer)
            users[0].visits = JSON.parse(results[0].visits)
            res.json(users[0]);
        } else {
            res.send(null);
        }
    });
});
app.get('/users', (req, res) => {

    const query = `SELECT * FROM users`;

    db.query(query, (err, results) => {
        if (err) {
            res.status(500).send('Ошибка сервера');
            return;
        }

        if (results.length > 0) {
            let users = results.map(user => {
                return {
                    ...user,
                    subscription: safeJSONParse(user.subscription),
                    trainer: safeJSONParse(user.trainer),
                    visits: safeJSONParse(user.visits),
                    paidAmount: safeJSONParse(user.paidAmount),
                    totalAmount: safeJSONParse(user.totalAmount),
                };
            });
            // users[0].trainer = JSON.parse(results[0].trainer)
            // users[0].visits = JSON.parse(results[0].visits)
            res.json(users);
        } else {
            res.send(null);
        }
    });
});



app.put('/users/:id', (req, res) => {
    // Получаем ID пользователя из параметров запроса
    const { id } = req.params;

    // Получаем обновленные данные пользователя из тела запроса
    const { subscription, trainer, visits } = req.body;

    // Подготовка SQL-запроса для обновления данных пользователя
    const updateQuery = `UPDATE users SET subscription = ?, trainer = ?, visits = ? WHERE id = ?`;

    // Выполнение запроса к базе данных
    db.query(updateQuery, [subscription, trainer, visits, id], (err, result) => {
        if (err) {
            // Обработка ошибки, если что-то пошло не так
            console.error('Ошибка при обновлении данных пользователя:', err);
            res.status(500).send('Ошибка при обновлении данных пользователя');
            return;
        }

        // Отправка ответа об успешном обновлении
        res.send('Данные пользователя успешно обновлены');
    });
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

