import * as catalog from '../services/catalogService.js';

export const services = async (req, res) => res.json(await catalog.listServices());
export const departments = async (req, res) => res.json(await catalog.listDepartments());
