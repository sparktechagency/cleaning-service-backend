import { NextFunction, Request, Response } from "express";
import { AnyZodObject, ZodEffects } from "zod";

const validateRequest =
  (schema: AnyZodObject | ZodEffects<any>) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Create the request object for validation
      const requestObject = {
        body: req.body,
        query: req.query,
        params: req.params,
      };

      await schema.parseAsync(requestObject);
      return next();
    } catch (err) {
      next(err);
    }
  };

export default validateRequest;
