// Error whose message is safe to show the client, with an explicit status code.
class AppError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
        Error.captureStackTrace(this, this.constructor);
    }
}

// Wraps an async controller so a rejected promise reaches the error handler
// instead of hanging the request.
const catchAsync = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { AppError, catchAsync };
