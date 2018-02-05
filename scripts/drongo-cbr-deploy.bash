#!/bin/bash

# CBR deploy script
# prerequisites:
# - deploy user and group exist
# - /home/deploy/drongos exists
# - /home/deploy/drongos/drongo-master has a running drongo
# synopsis:
# - release on github, obtain .tar.gz release url
# -$ drongo-cbr-deploy version.tar.gz
# - if all is well,
# -$ shutdown -r now

# arguments - release tar.gz file
ARCHIVE_URL=$1

# config
ARCHIVE_FOLDER=drongolatest
ARCHIVE_TMPFILE=$ARCHIVE_FOLDER.tar.gz
CUR_RELEASE_FOLDER=drongo-master

# deploy..
cd /home/deploy/drongos

rm $ARCHIVE_TMPFILE

wget -O $ARCHIVE_TMPFILE $ARCHIVE_URL

mkdir $ARCHIVE_FOLDER

cd $ARCHIVE_FOLDER

  tar -zxvf ../$ARCHIVE_TMPFILE --strip-components=1

  cp ../$CUR_RELEASE_FOLDER/config.json ./config.json

  mkdir logs

  npm install

cd ..

chown -R deploy:deploy $ARCHIVE_FOLDER

chmod -R 700 $ARCHIVE_FOLDER

rm -rf $CUR_RELEASE_FOLDER

mv $ARCHIVE_FOLDER $CUR_RELEASE_FOLDER

# if this is all good then ..
# shutdown -r now
