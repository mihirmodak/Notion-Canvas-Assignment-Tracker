//*========================================================================
// Setup
//*========================================================================

// Import necessary modules
const {Client} = require("@notionhq/client")
const customenv = require("custom-env").env("internal")
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const filesys = require("fs");

//Create Notion API Client and define Database ID
const notion = new Client({ auth:process.env.NOTION_KEY })
const databaseId = process.env.NOTION_DATABASE_ID

// Initialize HTTP Request to get data from Canvas
const Http = new XMLHttpRequest();

// Initialize variables
var subjects = [];


//*========================================================================
// Main
//*========================================================================

async function main() {
    // Name, Due Date, Type
    // name, due_at, submission_types
    // "start_at": "2021-05"

    // 1. Get subject Names and IDs from Canvas
    getCanvasSubjects()
    console.log("Enrolled Subjects:")
    console.log(subjects)
    console.log("\n")

    // 2. Get Assignment Data from Canvas, save it to a file
    var assignments = subjects.map( async function(subject) {
        return await getAssignmentData(subject)
    });
    console.log(assignments)

}


//*========================================================================
// Requests
//*========================================================================

function getCanvasSubjects() {
 /**
 * This function returns all the subjects and their IDs for the coming term
 */
    url = "https://umd.instructure.com/api/v1/courses?access_token=" + process.env.CANVAS_ACCESS_TOKEN;

    Http.open("GET", url, async=false);
    Http.send();

    const data = Http.responseText.replace(/},{/g , "},\n{").split("\n");

    data.map( (item) => {
        var output = parseSingleSubject(item);
        if (output[0] != undefined) {
            output[0] = output[0].split('"')[1].split("-")[0] // remove all quotes and section numbers from subject name
            subjects.push( [output[0], output[1]] )
        }
    })
}


async function getAssignmentData(Course, assignments=[]) {
    
    var subjectURL = "https://umd.instructure.com/api/v1/courses/" + Course[1] + "/assignments?access_token=" + process.env.CANVAS_ACCESS_TOKEN;
    Http.open("GET", subjectURL, async=false);
    Http.send();

    const data = Http.responseText.replace(/},{/g, "},\n{").split("\n");
    // filesys.writeFile('./data/' + Course[1] + '.json', data, function (err) {
    //     if (err) throw err;
    //     console.log("Saved Assignment data for " + Course[0]);
    // })

    data.map( function (item) {
        var output = parseAssignmentData(item);
        if (output[0] != undefined) {
            // output[0] = output[0].split('"')[1].split("-")[0] // remove all quotes and section numbers from subject name
            assignments.push( [subjects[0], output] )
        }
    });
    return assignments
}

//*========================================================================
// Helpers
//*========================================================================

function parseSingleSubject(SubjectData, OutputObj=[]) {
    var temp = SubjectData.split(",");

    var key; var value; var startDate;
    temp.map( (item) => {
        var term = item.split(":");

        if (term[0].includes('"name"')) {
            key = term[1];
        } else if (term[0].includes('"id"')) {
            value = term[1];
        } else if (term[0].includes('"start_at"')) {
            startDate = term[1];
        }

        if ( (key != undefined && value != undefined && startDate != undefined) && startDate.includes(process.env.TERM_START_DATE) )  {
            // OutputObj[key] = parseInt(value, 10);
            OutputObj[0] = key;
            OutputObj[1] = parseInt(value, 10);
        } else if (key != undefined && value != undefined && startDate != undefined && key.includes("BIOE Advising")) {
            // OutputObj[key] = parseInt(value, 10);
            OutputObj[0] = key;
            OutputObj[1] = parseInt(value, 10);
        }
    });

    return OutputObj;
}


function parseAssignmentData(AssignmentData, OutputObj=[]) {
    var temp = AssignmentData.split(",");

    var assignmentName; var dueDate; var subType;
    temp.map( (item) => {
        var term = item.split(":");
        if (term[0].includes('name')) {
            assignmentName = term[1];
        } else if (term[0].includes('due_at')) {
            dueDate = term[1];
        } else if (term[0].includes('submission_types')) {
            subType = term[1];
        }

        if ( (assignmentName != undefined && dueDate != undefined && subType != undefined) && (new Date(dueDate) > new Date()) ) {
            OutputObj[0] = assignmentName;
            OutputObj[1] = dueDate;
            OutputObj[2] = subType;            
        }
    });
    console.log(OutputObj)
    return OutputObj;
}

function filterAssignments(assignments) {
    
}

function extractVariables(assignments) {

}


if (require.main === module) {
    main();
}