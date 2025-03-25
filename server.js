import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import fs from 'fs';
import path from 'path';
import Parser from 'tree-sitter';
import JavaScript from 'tree-sitter-javascript';

// Function to search directory for a text match
function searchDirectory(dir, searchText) {
    // example: matches = [{'file': 'temp', 'line': 4, 'column': 5}];
    const matches = [];

    // Recursive function to traverse directories and read files
    function searchFile(filePath) {
        const stats = fs.statSync(filePath);
        
        // If it's a directory, traverse it
        if (stats.isDirectory()) {
            const files = fs.readdirSync(filePath);
            files.forEach(file => {
                searchFile(path.join(filePath, file));
            });
        }
        // If it's a file, check it for matches
        else if (stats.isFile()) {

            const content = fs.readFileSync(filePath, 'utf-8');
            const lines = content.split('\n');

            lines.forEach((line, lineNumber) => {
                let columnNumber = line.indexOf(searchText);
                while (columnNumber !== -1) {
                    matches.push({
                        file: filePath,
                        line: lineNumber + 1,
                        column: columnNumber + 1
                    });
                    columnNumber = line.indexOf(searchText, columnNumber + 1);
                }
            });
        }
    }

    searchFile(dir);
    return matches;
}

// Initialize the Tree-sitter parser
const parser = new Parser();
parser.setLanguage(JavaScript);

// Function to parse a file and search for the target string
function searchInFile(filePath, targetString) {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const tree = parser.parse(fileContent);

  const matches = [];

  // Recursive function to traverse the AST nodes
  function traverseNode(node) {
    // If the node contains the target string in its text, add it to the matches
    if (node.text.includes(targetString)) {
      matches.push({
        file: filePath,
        nodeText: node.text,
        nodeType: node.type,
        startPosition: node.startPosition,
        endPosition: node.endPosition,
      });
    }

    // Traverse child nodes
    node.namedChildren.forEach(traverseNode);
  }
  // Start traversing from the root node
  traverseNode(tree.rootNode);

  return matches;
}

// Function to search through all files in a directory
function searchInDirectory(directoryPath, targetString) {
  const results = [];

  // Read all files in the directory
  const files = fs.readdirSync(directoryPath);

  files.forEach((file) => {
    const fullPath = path.join(directoryPath, file);

    if (fs.lstatSync(fullPath).isFile() && file.endsWith('.js')) {
      const matches = searchInFile(fullPath, targetString);
      if (matches.length > 0) {
        results.push(...matches);
      }
    }
  });

  return results;
}

// Set up MCP server
const server = new McpServer({
  name: "example-server",
  version: "1.0.0"
});

server.tool(
    "get-text-matches",
    "Get references to text",
    {
      text: z.string(),
      directory: z.string(),
    },
    async ({ text, directory }) => {

      // hard code the directory in question below
      // directory = '/YOUR/ABSOLUTE/PATH/HERE';
      
      const result = searchDirectory(directory, text);
  
    return {
        content: result.map((match) => ({
          type: "text",
          text: `File: ${match.file.slice(directory.length)}, Line: ${match.line}, Column: ${match.column}`,
        }))
      };
    },
  );

  server.tool(
    "get-parse-tree",
    "Get a parse tree to find reference",
    {
      text: z.string(),
      directory: z.string(),
    },
    async ({ text, directory }) => {

      // hard code the directory in question below
      // directory = '/YOUR/ABSOLUTE/PATH/HERE';

      const result = searchInDirectory(directory, text);
  
    return {
        content: result.map((match) => ({
          type: "text",
          text: `File: ${match.file.slice(directory.length)}, Node Text: ${match.nodeText}, Node Type: ${match.nodeType}, Start Position: { row: ${match.startPosition.row}, column: ${match.startPosition.row}, End Position: { row: ${match.endPosition.row}, column: ${match.endPosition.row}`,
        }))
      };
    },
  );

// Set up express app
const app = express();

// Store the transport globally (for simplicity, assuming only one connection at a time)
let globalTransport = null;

// Define SSE endpoint
app.get("/sse", async (req, res) => {
  globalTransport = new SSEServerTransport("/messages", res);
  await server.connect(globalTransport);
});

// Define POST endpoint to handle messages
app.post("/messages", async (req, res) => {
  if (globalTransport) {
    await globalTransport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No active SSE connection.");
  }
});

// Start the server
app.listen(3001, () => {
  console.log("Server is running on http://localhost:3001");
});
