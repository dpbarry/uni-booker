require("dotenv").config();

const express = require("express");
const mongoose = require("better-sqlite3");
const session = require("express-session");

const path = require("path");