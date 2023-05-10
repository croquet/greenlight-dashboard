/* globals firebase,firebaseui */

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional

import {firebaseConfig} from "./firebase-config-loader.js";

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

let loc = window.location;
let origin = `${loc.protocol}//${loc.host}`;
let pathname = loc.pathname;
let searchString = loc.search;
let ind = pathname.lastIndexOf("/");
let path = pathname.slice(0, ind + 1);


if (origin.startsWith("http://localhost")) {
    path += "user2.html";
}

let userPage = `${origin}${path}${searchString}`;

let uiConfig = {
    signInSuccessUrl: userPage,
    signInOptions: [
        {
            provider: firebase.auth.GoogleAuthProvider.PROVIDER_ID,
            scopes: [
                'https://www.googleapis.com/auth/userinfo.email'
            ],
            customParameters: {
                // Forces account selection even when one account
                // is available.
                prompt: 'select_account'
            }
        },
        {
            provider: firebase.auth.EmailAuthProvider.PROVIDER_ID,
            forceSameDevice: false,
            buttonColor: "#077751",
        }
    ],
    tosUrl: '../terms.html',
    privacyPolicyUrl: "../privacy.html"
};

let ui = new firebaseui.auth.AuthUI(firebase.auth());

if (ui.isPendingRedirect()) {
    // we actually have to get the login screen based on this flag
    let container = document.querySelector("#login-container");
    container.style.setProperty("display", "none");
}

ui.start('#firebaseui-auth-container', uiConfig);

/*
{
    provider: firebase.auth.GithubAuthProvider.PROVIDER_ID,
},
{
    provider: firebase.auth.EmailAuthProvider.PROVIDER_ID,
    forceSameDevice: false,
}
*/
