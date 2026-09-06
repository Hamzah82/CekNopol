/**
 * roleManager.js — Kelola role admin & reseller (db/admin.json & db/reseller.json)
 */

const fs = require('fs');
const path = require('path');

let dbPath = './db';

function setDbPath(basePath) {
  dbPath = basePath;
}

function readJsonFile(filename) {
  try {
    const filePath = path.join(dbPath, filename);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, '[]', 'utf-8');
      return [];
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[roleManager] Error membaca ${filename}:`, err.message);
    const filePath = path.join(dbPath, filename);
    fs.writeFileSync(filePath, '[]', 'utf-8');
    return [];
  }
}

function writeJsonFile(filename, data) {
  try {
    const filePath = path.join(dbPath, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[roleManager] Error menulis ${filename}:`, err.message);
  }
}

// ─── Admin ───────────────────────────────────────────────────

function getAdmins() {
  return readJsonFile('admin.json');
}

function addAdmin(userId) {
  const admins = getAdmins();
  const id = Number(userId);
  if (admins.includes(id)) return false;
  admins.push(id);
  writeJsonFile('admin.json', admins);
  return true;
}

function removeAdmin(userId) {
  const admins = getAdmins();
  const id = Number(userId);
  const idx = admins.indexOf(id);
  if (idx === -1) return false;
  admins.splice(idx, 1);
  writeJsonFile('admin.json', admins);
  return true;
}

function isAdmin(userId) {
  const admins = getAdmins();
  return admins.includes(Number(userId));
}

// ─── Reseller ────────────────────────────────────────────────

function getResellers() {
  return readJsonFile('reseller.json');
}

function addReseller(userId) {
  const resellers = getResellers();
  const id = Number(userId);
  if (resellers.includes(id)) return false;
  resellers.push(id);
  writeJsonFile('reseller.json', resellers);
  return true;
}

function removeReseller(userId) {
  const resellers = getResellers();
  const id = Number(userId);
  const idx = resellers.indexOf(id);
  if (idx === -1) return false;
  resellers.splice(idx, 1);
  writeJsonFile('reseller.json', resellers);
  return true;
}

function isReseller(userId) {
  const resellers = getResellers();
  return resellers.includes(Number(userId));
}

module.exports = {
  setDbPath,
  // Admin
  getAdmins,
  addAdmin,
  removeAdmin,
  isAdmin,
  // Reseller
  getResellers,
  addReseller,
  removeReseller,
  isReseller,
};