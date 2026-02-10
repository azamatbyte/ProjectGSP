const express = require("express");
const auth = require('./auth')
const message = require('./message')
const file_uploads = require('./file_uploads');
const register = require('./register');
const relative = require('./relative');
const workPlace = require('./workPlace');
const relationDegree = require('./realtionDegre');
const service = require('./service');
const form = require('./form');
const accessStatus = require('./accessStatus');
const registerFour = require('./registartionFour');
const { verifyToken } = require('../middleware/auth');
const raport = require('./raport');
const statistics = require('./statistcs');
const initiator = require('./initiator');
const logs = require('./logs');
const signList = require('./signList');
const sessions = require('./sessions');
const router = express.Router();
const conclusion = require('./conclusion');
const migration = require('./migration');

router.use('/auth', auth);
router.use('/services', service);
router.use('/register', register);
router.use('/forms', form);
router.use('/relatives', relative);
router.use('/raport', raport);
router.use('/statistics', statistics);
router.use('/registerFour', registerFour);
router.use('/workplaces', workPlace);
router.use('/relationdgr', relationDegree);
router.use('/initiator', initiator);
router.use('/status', accessStatus);
router.use('/logs', logs);
router.use('/signlist', signList);
router.use('/session', sessions);
router.use('/upload', verifyToken, file_uploads);
router.use('/conclusion', conclusion);
router.use('/migration', migration);

module.exports = router;

