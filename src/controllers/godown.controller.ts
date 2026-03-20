import { Request, Response } from "express";
import prisma from "../utils/prisma";



/* CREATE GODOWN */

export const createGodown = async (req: Request, res: Response) => {

  try {

    const {
      godownName,
      streetAddress,
      stateName,
      cityName,
      pincode
    } = req.body;

    if (!godownName) {
      return res.status(400).json({
        success: false,
        message: "Godown name is required"
      });
    }

    const godown = await prisma.godown.create({
      data: {
        godown_name: godownName,
        street_address: streetAddress,
        state_name: stateName,
        city_name: cityName,
        pincode
      }
    });

    res.status(201).json({
      success: true,
      data: godown
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      message: "Error creating godown"
    });

  }

};



/* GET ALL GODOWNS */

export const getGodowns = async (req: Request, res: Response) => {

  try {

    const godowns = await prisma.godown.findMany({
      orderBy: {
        created_at: "desc"
      }
    });

    res.json({
      success: true,
      data: godowns
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: "Error fetching godowns"
    });

  }

};



/* GET SINGLE GODOWN */

export const getGodownById = async (req: Request, res: Response) => {

  try {

    const godown_id = Number(req.params.id);

    const godown = await prisma.godown.findUnique({
      where: { godown_id }
    });

    if (!godown) {
      return res.status(404).json({
        success: false,
        message: "Godown not found"
      });
    }

    res.json({
      success: true,
      data: godown
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: "Error fetching godown"
    });

  }

};



/* UPDATE GODOWN */

export const updateGodown = async (req: Request, res: Response) => {

  try {

    const godown_id = Number(req.params.id);

    const {
      godownName,
      streetAddress,
      stateName,
      cityName,
      pincode
    } = req.body;

    const godown = await prisma.godown.update({
      where: { godown_id },
      data: {
        godown_name: godownName,
        street_address: streetAddress,
        state_name: stateName,
        city_name: cityName,
        pincode
      }
    });

    res.json({
      success: true,
      data: godown
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: "Error updating godown"
    });

  }

};



/* DELETE GODOWN */

export const deleteGodown = async (req: Request, res: Response) => {

  try {

    const godown_id = Number(req.params.id);

    await prisma.godown.delete({
      where: { godown_id }
    });

    res.json({
      success: true,
      message: "Godown deleted successfully"
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: "Error deleting godown"
    });

  }

};