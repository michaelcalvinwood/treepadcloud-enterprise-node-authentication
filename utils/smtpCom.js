require('dotenv').config();
const axios =  require('axios');

exports.sendEmaiViaSMTPcom = (recipientEmailAddress, senderEmailAddress, subject, html, fromName = '') => {
   return new Promise((resolve, reject) => {
       let request = {
           url: `https://api.smtp.com/v4/messages?api_key=${process.env.SMTP_COM_API_KEY}`,
           method: 'post',
           data: {
               "channel": process.env.SMTP_COM_CHANNEL,
               "recipients": {
                 "to": [
                   {
                     "address": recipientEmailAddress
                   }
                 ]
               },
               "originator": {
                 "from": {
                   "name": fromName ? fromName : senderEmailAddress,
                   "address": senderEmailAddress
                 }
               },
               "subject": subject,
               "body": {
                 "parts": [
                   {
                     "type": "text/html",
                     "content": html
                   }
                 ]
               }
             }
       }

       axios(request)
       .then(result => {
           console.log (result.data);
            resolve(result.data)       
           return;
       })
       .catch(err => {
           console.log('error', JSON.stringify(err));
           reject(err)
           return;
       })
    
       return;
   })
}