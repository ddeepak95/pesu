# Assignment Feature Implementation

## Overview
Complete implementation of the Assignment feature for the Speak2Learn application, allowing teachers to create, view, edit, and delete learning assignments for their classes.

## Features Implemented

### 1. Database Structure
- **assignments** table with the following fields:
  - `id` - UUID primary key
  - `assignment_id` - Unique 8-character identifier (using nanoid)
  - `class_id` - Foreign key to classes table
  - `title` - Assignment title
  - `questions` - JSONB array of question objects, each containing:
    - `order` - Question order/position (0-indexed)
    - `prompt` - Question instructions/prompt
    - `total_points` - Points for this question
    - `rubric` - Array of rubric items (item description + points)
    - `supporting_content` - Additional instructions or materials for this question
  - `total_points` - Total points for the entire assignment (sum of all questions)
  - `created_by` - User who created the assignment
  - `created_at` / `updated_at` - Timestamps
  - `status` - 'active' or 'deleted' (soft delete)

### 2. Authorization
**Row Level Security (RLS) Policies:**
- Teachers can view, create, edit, and delete assignments for classes they own OR are associated with (via `class_teachers` table)
- This allows both class owners and co-teachers to fully manage assignments
- Authorization is handled at the database level for security

### 3. Components Created

#### Type Definitions
- `src/types/assignment.ts`
  - Assignment interface
  - RubricItem interface

#### Database Queries
- `src/lib/queries/assignments.ts`
  - `getAssignmentsByClass()` - Fetch all assignments for a class
  - `getAssignmentById()` - Fetch single assignment by ID
  - `createAssignment()` - Create new assignment
  - `updateAssignment()` - Update existing assignment
  - `deleteAssignment()` - Soft delete assignment

#### Reusable Components
- `src/components/Teacher/Assignments/RubricItemRow.tsx`
  - Single rubric item row with description and points inputs
  - Includes remove button
  - Used for dynamic rubric building

- `src/components/Teacher/Assignments/QuestionCard.tsx`
  - Complete question card with all fields for one question
  - Includes: Prompt, Total Points, Rubric Items, Supporting Content
  - Up/Down arrows for reordering questions
  - Delete button to remove question
  - Fully self-contained question editor

- `src/components/Teacher/Assignments/AssignmentCard.tsx`
  - Display assignment in list view
  - Shows title and total points
  - Three-dot menu with Copy link, Edit, Delete options

#### Pages
- `src/app/teacher/classes/[classId]/assignments/create/page.tsx`
  - Full-page form for creating assignments
  - Assignment Title field
  - Multiple QuestionCard components (dynamic)
  - Each question has: Prompt, Total Points (auto-calculated), Rubric Items (dynamic), Supporting Content
  - "Add Question" button to add more questions
  - Questions can be reordered using up/down arrows
  - Questions can be deleted (minimum 1 question required)
  - Form validation for each question
  - Total assignment points calculated from all questions
  - Navigates back to class page after creation

#### Updated Components
- `src/components/Teacher/Classes/Assignments.tsx`
  - Lists all assignments for a class
  - "Create Assignment" button
  - Handles delete and copy link actions
  - Loading and error states
  - Empty state message

## Key Features

### Multiple Questions with Ordering
- Assignments can have multiple questions (minimum 1)
- Each question is independent with its own:
  - Prompt/instructions
  - Rubric items
  - Point value (auto-calculated from rubric)
  - Supporting content
- Questions can be reordered using up/down arrows
- Question order is preserved in the database
- Questions can be deleted (except the last one)

### Dynamic Rubric Builder
- Each question has its own rubric
- Teachers can add/remove rubric items dynamically per question
- Each item has a description and point value
- Total points per question automatically calculated from rubric items
- Total assignment points calculated from all question points
- Minimum one rubric item required per question

### Multi-Teacher Support
- Class owners and co-teachers can all manage assignments
- Authorization enforced at database level via RLS policies
- No special UI logic needed - all teachers have same permissions

### Soft Delete
- Assignments are soft-deleted (status set to 'deleted')
- Preserves data integrity and allows potential recovery
- Deleted assignments excluded from all queries

## Database Setup

### Prerequisites
- Supabase project with existing `classes` and `class_teachers` tables
- User authentication already configured

### Migration Steps

1. **Run the SQL migration:**
   ```sql
   -- Execute the contents of supabase_assignments_migration.sql
   -- in your Supabase SQL Editor
   ```

2. **Verify table creation:**
   - Check that `assignments` table exists
   - Verify indexes are created
   - Confirm RLS policies are active

3. **Test authorization:**
   - Create a test assignment as class owner
   - Add a co-teacher to a class
   - Verify co-teacher can view/edit/delete assignments

## File Structure

```
src/
├── types/
│   └── assignment.ts                           # Type definitions (Assignment, Question, RubricItem)
├── lib/
│   └── queries/
│       └── assignments.ts                      # Database queries
├── components/
│   ├── Teacher/
│   │   ├── Assignments/
│   │   │   ├── AssignmentCard.tsx             # Assignment list item
│   │   │   ├── QuestionCard.tsx               # Individual question editor with reorder controls
│   │   │   └── RubricItemRow.tsx              # Rubric item input
│   │   └── Classes/
│   │       └── Assignments.tsx                 # Main assignments list (updated)
│   └── ui/
│       └── List.tsx                            # Reusable list component (existing)
└── app/
    └── teacher/
        └── classes/
            └── [classId]/
                └── assignments/
                    └── create/
                        └── page.tsx            # Create assignment page

supabase_assignments_migration.sql              # Database migration script
```

## Usage Flow

### Creating an Assignment
1. Teacher navigates to a class detail page
2. Clicks "Assignments" tab
3. Clicks "Create Assignment" button
4. Fills in assignment title
5. For each question:
   - Enters prompt/instructions
   - Adds rubric items (description + points)
   - Adds supporting content (optional)
   - Can reorder questions using up/down arrows
   - Can delete questions (if more than one exists)
6. Can add more questions using "Add Question" button
7. Reviews total points (automatically calculated)
8. Submits form
9. Redirected back to class page with new assignment visible

### Managing Assignments
1. View all assignments in the Assignments tab
2. Click three-dot menu on any assignment:
   - **Copy link**: Copies shareable link to clipboard
   - **Edit**: Opens edit form (to be implemented)
   - **Delete**: Soft deletes after confirmation

## Future Enhancements

### Pending Implementation
- Edit assignment functionality
- Assignment detail view page
- Student submission interface
- Grading interface
- Assignment analytics and reporting

### Suggested Features
- Duplicate assignment
- Assignment templates
- Bulk operations
- Assignment scheduling (due dates)
- File attachments for supporting content
- Rich text editor for prompts

## Notes

- All authorization is handled via RLS policies for security
- Uses nanoid for generating unique 8-character assignment IDs
- Follows same patterns as class management for consistency
- Components are reusable and follow React best practices
- Questions stored as JSONB array in database for flexibility
- Question order is maintained and can be changed via UI
- Total points per question auto-calculated from rubric items
- Total assignment points auto-calculated from all questions
- Minimum 1 question required per assignment
- Each question maintains its own rubric and supporting content

