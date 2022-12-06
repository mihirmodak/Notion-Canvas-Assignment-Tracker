# To add a new cell, type '# %%'
# To add a new markdown cell, type '# %% [markdown]'
# %% [markdown]
# ## 1. Import the necessary modules

# %%
from dotenv import dotenv_values
env = dotenv_values(".env")

import requests
canvas_tokens = {'access_token': env['CANVAS_ACCESS_TOKEN']}

from datetime import datetime,timedelta
import pytz
utc = pytz.timezone("UTC")
timezone = pytz.timezone("America/New_York")

import codecs
import re
import numpy as np
import traceback
import json

# %% [markdown]
# ## 2. Create a function to parse HTML

# %%
def cleanHTML(rawHTML):
    cleanr = re.compile('<.*?>|&([a-z0-9]+|#[0-9]{1,6}|#x[0-9a-f]{1,6});')
    cleantext = re.sub(cleanr, '', rawHTML)
    return cleantext

# %% [markdown]
# ## 3. Create functions to access broad course-level data from Instructure

# %%
def getCourseIDs():
    url = "https://umd.instructure.com/api/v1/courses"
    r = requests.get(url, params=canvas_tokens)
    if r.status_code != 200:
        print(r.status_code)
        print(r.text)
    response = ('},\n{"id"').join( r.text.split('},{"id"') )

    # with open("courses.json", "w+") as f:
    #     f.write(response)

    subjectData = parseSubjectData(response)
    return subjectData

# Takes in the Http response data for all subject
# Returns a list of dicts, each element of the list is a separate subject, the dict contains the name, id
def parseSubjectData(responseData):
    subjects = []
    for subject in responseData.split("\n"):
        parsed = subject[:-1].split(",")
        toAppend = False
        for item in parsed:
            KVPairs = item.split('":')

            if '"name' in KVPairs[0]:
                name = KVPairs[1].split('"')[1].split("-")[0]
            elif '{"id' in KVPairs[0]:
                id = KVPairs[1]
                # if id == '1215363': # Special Case to include BIOE Advising
                #     toAppend = True
            elif '"start_at' in KVPairs[0]:
                if datetime.strptime(KVPairs[1], '"%Y-%m-%dT%H:%M:%SZ"').date() > datetime.strptime(env['TERM_START_DATE'], "%Y-%m").date():
                    toAppend = True
        if toAppend:
            subjects.append({"name":name, "id":id})
    return subjects


# %%
subjects = getCourseIDs()
print(subjects)

# %% [markdown]
# ## 4. Create functions to access Assignment data from Instructure

# %%
def getAssignmentData(CourseID):
    url = f"https://umd.instructure.com/api/v1/courses/{CourseID}/assignments"
    r = requests.get(url, params=canvas_tokens)
    response = ('},\n{"id"').join( r.text.split('},{"id"') )

    # with open(f"{CourseID}.json", "w+") as f:
    #     f.write(response)

    assignmentData = parseAssignmentData(response)
    return assignmentData

# Takes in the Http response data for all subject
# Returns a list of dicts, each element of the list is a separate subject, the dict contains the name, id
def parseAssignmentData(responseData):
    assignments = []
    for assignment in responseData.split("\n"):
        parsed = assignment[:-1].split(",")
        toAppend = False
        # print("\n")
        for item in parsed:
            KVPairs = item.split('":')
            KVPairs[0] = KVPairs[0].split('"')[1]
            # print(KVPairs)

            try:
                if KVPairs[0] == 'name': # This is a specific condition (==) because there are multiple fields that have the word name
                    name = KVPairs[1]
                    # print(f"Pair: {KVPairs[0]}, Name: {name}")
                elif 'due_at' in KVPairs[0]: # allows for keys such as '"due_at' and '"due_at"'
                    if datetime.strptime(KVPairs[1], '"%Y-%m-%dT%H:%M:%SZ"').date() > datetime.strptime(env['TERM_START_DATE'], "%Y-%m").date():
                        # dueDate = datetime.strptime(KVPairs[1], '"%Y-%m-%dT%H:%M:%SZ"') - timedelta(hours=4, minutes=0) # Time returned from Canvas API is in UTC time zone, convert to EST
                        dueDate = datetime.strptime(KVPairs[1], '"%Y-%m-%dT%H:%M:%SZ"')
                        dueDate = utc.localize(dueDate)
                        dueDate = dueDate.replace(tzinfo=pytz.UTC).astimezone(timezone)
                        toAppend = True
                elif 'submission_types' in KVPairs[0]:
                    submissionType = KVPairs[1][1:-1].split('"') # List formatting
                    submissionType = list(filter(lambda x: ',' not in x and x != '', submissionType)) # More List formatting
                elif 'description' in KVPairs[0]:
                    desc = cleanHTML(codecs.decode(KVPairs[1], 'unicode_escape'))
                elif 'html_url' in KVPairs[0]:
                    assignmentURL = KVPairs[1].split('"')[1]
            except Exception as e:
                print(f"Error: {KVPairs}\n{traceback.format_exc()}")

        if toAppend:
            # print(f"name:{name},\ndue:{dueDate},\nsubmission:{submissionType},\ndesc: {desc.strip()},\nurl:{assignmentURL}")
            assignments.append({"name":name.strip(), "due":dueDate, "submission":submissionType, "desc": desc.strip(), "url":assignmentURL})
    return assignments


# %%
assignmentData = []
for entry in subjects:
    print(f"************{entry}************")
    assignmentData.append(
        getAssignmentData(entry['id'])
    )
    # assignmentData.append("")
assignmentData = np.ravel(assignmentData).flatten().tolist() # Making the get response data more human readable

# %% [markdown]
# ## 5. Define necessary variables to connect to notion

# %%
notion_url = f"https://api.notion.com/v1/pages"

notion_tokens = {'Authorization': env['NOTION_KEY']}

# %% [markdown]
# ## 6. Define functions to filter assignments and post data

# %%
def getCurrentAssignments(database_id):
    r = requests.post(f"https://api.notion.com/v1/databases/{database_id}/query", headers=notion_tokens)
    response = r.json()["results"]
    current_assignments = []
    for item in response:
        current_assignments.append(
            item['properties']['Name']['title'][0]['plain_text']
        )
    return current_assignments

def filterAssignments(assignmentData, database_id=env['NOTION_TESTING_DATABASE_ID']):

    filteredAssignmentData = assignmentData[:]
    
    currentAssignments = getCurrentAssignments(database_id)

    for assignment in assignmentData:
        if assignment['name'] in currentAssignments:
            filteredAssignmentData.remove(assignment)
    return filteredAssignmentData


# %%
print(getCurrentAssignments(env['NOTION_TESTING_DATABASE_ID']))


# %%
filteredAssignmentData = filterAssignments(assignmentData)
filteredAssignmentData

# %% [markdown]
# ## 7. Single `for` loop to create json data structure and run the Notion Connection Process

# %%
for assignment in filteredAssignmentData:

    data = {
        "parent": {"database_id":env['NOTION_TESTING_DATABASE_ID'],},

        "properties": {
            "Name" : {
                "title": [
                    {
                        "text": {
                            "content": assignment['name'] 
                        }
                    }
                ]
            },
            "Due Date": {
                "date":{
                    "start":assignment['due'].isoformat()
                }

            },
            "Type": {
                "select": {
                    "name": "Quiz" if 'online_quiz' in assignment['submission'] else \
                            "Homework" if assignment['name'].split(' ')[0].lower() == "homework" else \
                            "Lab" if assignment['name'].split(' ')[0].lower() == "lab" else \
                            "Exam" if assignment['name'].split(' ')[0].lower() in ['exam', 'midterm', 'final'] else \
                            "Assignment"
                }
            }
        }
        # "children":[
        #     {
        #         "object": "block",
        #         "type": "heading_2",
        #         "heading_2": {
        #             "text": [{ "type": "text", "text": { "content": "Description" } }]
        #         }
        #     },
        #     {
        #         "object": "block",
        #         "type": "paragraph",
        #         "paragraph": {
        #             "text": [
        #                 {
        #                     "type": "text",
        #                     "text": {
        #                         "content": assignment['desc'],
        #                     }
        #                 }
        #             ]
        #         }
        #     },
        #     {
        #         "object": "block",
        #         "type": "paragraph",
        #         "paragraph": {
        #             "text": [
        #                 {
        #                     "type": "text",
        #                     "text": {
        #                         "content": "Link",
        #                         "link": { "url": assignment["url"] }
        #                     }
        #                 }
        #             ]
        #         }
        #     }
        # ]
    }

    r = requests.post(notion_url, json=data, headers=notion_tokens)
    print(f"{assignment['name']} --> {r.status_code}")
    if r.status_code != 200:
        print(f"{r.text['code']} : {r.text['message']}")

# %% [markdown]
# ## Future Work
# 
# ### Noah's suggestions:
# 
# 1. Description, i.e. text or image, # Category of Assignment
# 2. Undated assignment persistence

