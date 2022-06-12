const S3 = require('aws-sdk/clients/s3');
const mime = require('mime-types');

const s3Client = new S3({
  buckerName: process.env.AWS_BUCKET_NAME,
  region: process.env.AWS_DEFAULT_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

exports.deleteFile = async Key => {
  try {
    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key,
    };

    await s3Client.deleteObject(params).promise();
  } catch (err) {
    console.log('Error deleting file from s3 bucket!', err.message);
  }
};

exports.uploadFile = async (data, fileName) => {
  try {
    const ContentType = mime.lookup(fileName);

    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      ContentEncoding: 'base64',
      Body: Buffer.from(data, 'base64'),
      Key: fileName,
      ContentType,
    };

    const { Location } = await s3Client.upload(params).promise();

    return Location;
  } catch (err) {
    console.log('Error uploading file to s3 bucket!', err.message);
  }
};
