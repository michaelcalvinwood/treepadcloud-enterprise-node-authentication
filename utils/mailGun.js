require('dotenv').config();

const formData = require('form-data');
const Mailgun = require('mailgun.js');

const mailgun = new Mailgun(formData);
const client = mailgun.client({username: 'api', key: process.env.MAIL_GUN_API_KEY});

 
 exports.sendEmailViaMailGun = async (email, sender, subject, message, senderName) => {

    const messageData = {
      from: `${senderName} <${sender}>`,
      to: email,
      subject,
      html: message
    };
    
    let result = null;

    try {
      result = await client.messages.create("treepadcloud.com", messageData);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
 }