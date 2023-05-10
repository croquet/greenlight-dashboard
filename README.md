# Greenlight Dashboard

## Introduction

Greenlight is a real time collaboration workspace application. A room in Greenlight is a large two-dimensional space where users can create many collaborative apps, notes, images and web pages and manipulate them. Its code is available at github.com/croquet/greenlight-core, and an installation is available at croquet.io/greenlight.

The Dashboard for Greenlight uses the Google Firebase authentication. Once a user is signed in, it shows the list of rooms available for the user.

The dashboard can launch any program. The launched program can use the information passed in via the `window` object to determine the user information. So this is a good starting point to customize it and adapt it to other applications.

## Deployment

First set up your firebase application and store the information in firebaseConfig.js. After running `npm install`, you run the shell script `build-files.sh` to create files to deploy in a directory called `dist`. You then copy your application files into the same `dist` directory, and copy the content to your server.
