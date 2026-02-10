const jwt = require("jsonwebtoken");
const config = require("../../config/auth.config");
// const db = require("../../db");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
// const Company = require("../../db/models/company");
// const Role = db.role;

const { TokenExpiredError } = jwt;

const catchError = (err, res) => {
  if (err instanceof TokenExpiredError) {
    return res.status(401).send({ status: 401, message: "Unauthorized! Access Token was expired!" });
  }

  return res.status(401).send({ status: 401, message: "Unauthorized!" });
}

const verifyToken = (req, res, next) => {
  let token = req.headers["x-access-token"];

  if (!token) {
    return res.status(403).send({ status: 403, message: "No token provided!" });
  }
  jwt.verify(token, config.secret, (err, decoded) => {

    if (err) {
      return catchError(err, res);
    }
    req.userId = decoded.id;
    next();
  });
};

const isAdmin = async (req, res, next) => {
  try {

    // Assuming `req.userId` is set in a previous middleware (e.g., authentication)
    const user = await prisma.admin.findUnique({
      where: { 
        id: req.userId,
        status: "active"
       }, // Assuming req.userId contains the user's ID
    });  

    if (!user) {
      return res.status(404).send({ message: "User not found!" });
    }

    // Check if the user's role is 'admin'
    if (user.role === 'admin') {
      await prisma.$disconnect();
      next(); // User is an admin, proceed to the next middleware or route handler
    } else {
      res.status(403).send({ message: "Require Admin Role!" }); // User is not an admin
    }
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Internal server error" });
    await prisma.$disconnect();
  }
};
const userCheck = async (req, res, next) => {
  try {
    // Assuming `req.userId` contains the ID of the user to fetch
    const user = await prisma.admin.findUnique({
      where: { id: req.userId }, // Find user by ID
    });

    // Check if user exists and has a role
    if (!user || !user.role) {
      return res.status(403).send({ message: "Internal server error" });
    }
    
    // Attach the user's role to the request object
    req.role = user.role;
    await prisma.$disconnect();
    next(); // Proceed to the next middleware or route handler
  } catch (err) {
    console.error(err);
    return res.status(500).send({ message: "Internal server error" });
  } finally {
    await prisma.$disconnect();
  }
};
// const isCompany = (req, res, next) => {
//   Company.find(
//     {
//       _id: { $in: req.userId }
//     },
//     (err, user) => {
//       if (err) {
//         res.status(500).send({ message: err });
//         return;
//       }
//       if (user.length == 1) {
//         next();
//         return;
//       }
//       res.status(403).send({ message: "Company is not found!" });
//       return;
//     }
//   );
// };

const isModerator = (req, res, next) => {
  User.findById(req.userId).exec((err, user) => {
    if (err) {
      res.status(500).send({ message: err });
      return;
    }

    Role.find(
      {
        _id: { $in: user.roles }
      },
      (err, roles) => {
        if (err) {
          res.status(500).send({ message: err });
          return;
        }

        for (let i = 0; i < roles.length; i++) {
          if (roles[i].name === "moderator") {
            next();
            return;
          }
        }

        res.status(403).send({ message: "Require Moderator Role!" });
        return;
      }
    );
  });
};

const permissionCheck = (permissions) => {
  return async (req, res, next) => {
    try {
      // Assuming req.userId is set from previous middleware
      const user = await prisma.admin.findUnique({
        where: { id: req.userId, status: "active" }, // Find user by ID
        select: {
          id: true,
          role: true,
        },
      });

      // If user doesn't exist, return 403
      if (!user) {
        return res.status(401).send({ status: 401, message: "User not found" });
      }
      
      if (user.role === 'superAdmin') {
        return next();
      }

      // Check if user roles intersect with required permissions
      const hasPermission = user?.role === permissions

      if (hasPermission) {
        next(); // User has permission, proceed to the next middleware/route
      } else {
        res.status(406).send({ status: 406, message: "Permission denied!" });
      }
    } catch (err) {
      console.error(err);
      res.status(500).send({ status: 500, message: "Internal server error" });
      await prisma.$disconnect();
    }
  };
};

const checkAdminAccess = (serviceCode) => {
  return async (req, res, next) => {
    
    try {
      const adminId = req.userId; // Assuming `req.userId` contains the logged-in admin's ID
      
      // Add validation for adminId
      if (!adminId) {
        return res.status(401).json({
          code: 401,
          message: 'Access denied! Admin ID not found in request.',
        });
      }

      // Fetch admin details, including roles and access
      const admin = await prisma.admin.findUnique({
        where: {
          id: adminId,
        },
        select: {
          id: true,    // Include ID for debugging
          role: true,
        },
      });

      if (!admin) {
        return res.status(401).json({
          code: 401,
          message: 'Access denied! Admin does not exist.',
        });
      }

      // If the admin has the "superAdmin" role, bypass access check
      if (admin.role === 'superAdmin') {
        return next();
      }

      // Check if the admin has access to the requested service
      const hasAccess = await prisma.adminServiceAccess.findFirst({
        where: {
          adminId: adminId,
          service: {
            code: serviceCode, // Match the service code
          },
        },
        include: {
          service: true, // Include service details for debugging
        },
      });

      if (!hasAccess) {
        return res.status(401).json({
          code: 401,
          message: 'Access denied! Admin does not have access to this service.',
        });
      }

      // Admin has access
      next();
    } catch (error) {
      console.error('❌ Error checking admin access:', error);
      res.status(500).json({
        status: 500,
        message: 'Internal server error.',
        error: error.message,
      });
    } finally {
      // Move disconnect to finally block to ensure it always runs
      try {
        await prisma.$disconnect();
      } catch (disconnectError) {
        console.error("Error disconnecting Prisma:", disconnectError);
      }
    }
  };
};

const authJwt = {
  verifyToken,
  isAdmin,
  // isCompany,
  isModerator,
  userCheck,
  permissionCheck,
  checkAdminAccess
};
module.exports = authJwt;