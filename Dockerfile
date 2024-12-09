# Step 1: Use the official Node.js image as the base image
FROM node:18-alpine AS builder

# Step 2: Set the working directory in the container
WORKDIR /app

# Step 3: Copy package.json and package-lock.json (or yarn.lock) to the working directory
COPY package*.json ./

# Step 4: Install dependencies
RUN npm install

# Step 5: Copy the rest of the application code to the working directory
COPY . .

# Step 6: Build the Next.js application
RUN npm run build

# Step 7: Use a smaller base image for the final stage
FROM node:18-alpine

# Step 8: Set the working directory
WORKDIR /app

# Step 9: Copy the built application and dependencies from the builder stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules

# Step 10: Expose the port on which the application will run
EXPOSE 3000

# Step 11: Set the command to run the application
CMD ["npm", "start"]
