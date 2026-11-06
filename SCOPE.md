## 1. Project Overview

**Project:** Restaurant Operations Platform — MVP

**Market:** Independent cafés and restaurants in Iran

**Purpose:** Build the foundation of a multi-tenant restaurant management platform, delivering one complete operational workflow while establishing an architecture that supports future restaurant operations, reporting, and business growth.

The initial release will focus on waiter-to-kitchen order management, with particular attention to:

- Coordinating preparation times for different dishes.
- Managing menu availability across multiple waiters.
- Keeping menu prices and item information consistent.
- Supporting the operational differences between Iranian restaurants and fast-food businesses.

The underlying infrastructure and data model will support future workflows such as checkout, payments, inventory, and reporting without requiring a fundamental architectural redesign.

## 2. Problem Statement

Restaurants in Iran frequently coordinate table orders, kitchen preparation, and service using a combination of paper notes, messaging apps, and verbal communication.

This creates several problems:

- Orders can be lost, duplicated, or misunderstood.
- Kitchen staff may not know which items are new or need preparation.
- Different dishes require different preparation times, making it difficult to coordinate when an entire table can be served.
- Waiters may promise customers unrealistic delivery times.
- Two waiters may simultaneously order the last available portion of a dish.
- Menu prices may become outdated due to changing ingredient costs and currency fluctuations.
- Customers may not have clear information about dish ingredients.

The MVP will address these problems while establishing a consistent source of truth for restaurant operations.

## 3. Product Strategy

The product will be developed incrementally.

### Initial release

Deliver a reliable waiter-to-kitchen workflow that coordinates ordering, preparation, availability, and service during an actual restaurant shift.

### Platform foundation

Establish the infrastructure, domain model, and data ownership boundaries required to support:

- Multiple restaurants and branches.
- Additional operational workflows.
- Historical reporting and business analytics.
- Future integrations with payment, inventory, and accounting systems.

### Future releases

Expand the platform based on validated customer needs rather than attempting to deliver every possible restaurant feature upfront.

## 4. Target Users

The initial product is designed for a restaurant operating a single branch, with the architecture supporting multiple branches and restaurants.

| Role | Responsibilities |
|---|---|
| Restaurant owner | Manage restaurant settings, menu, prices, ingredients, availability, and staff |
| Waiter | Create orders, add items, and track preparation and availability |
| Kitchen staff | View incoming orders, manage preparation, and update item status |

Each user will have an authenticated account and permissions appropriate to their role.

## 5. User Experience and Navigation

### 5.1 Authentication and Role-Based Access

The application will provide a single login page for all restaurant staff.

After successful authentication, the system will identify the user's role and display the appropriate dashboard, navigation, and available actions.

- Restaurant owners will access restaurant management functions.
- Waiters will access table management, menu selection, and order tracking.
- Kitchen staff will access incoming orders and preparation management.

Users will not be able to access unauthorized functionality by navigating directly to a URL or calling an API endpoint.

### 5.2 Waiter Ordering Flow

The waiter dashboard will provide a prominent **New Order** action.

Selecting this action will open a guided ordering workflow:

1. **Select table:** Display the restaurant's tables and their current status.
2. **Select menu items:** Display the current menu, prices, ingredients, and availability.
3. **Configure order:** Allow the waiter to select quantities and add special instructions.
4. **Review order:** Display the selected items, total price, and estimated readiness time.
5. **Confirm order:** Validate availability, reserve the requested quantities, and submit the order to the kitchen.

The waiter will be able to return to an existing table order and add additional items without creating a duplicate table order.

The interface will clearly distinguish between available, unavailable, and newly added items.

If an item becomes unavailable while the waiter is creating an order, the system will prevent confirmation of that item and explain the reason.

The ordering workflow will be optimized for mobile and tablet use, with minimal navigation and clear feedback at each step.

## 6. Functional Requirements

### 6.1 Menu management

Restaurant owners will be able to:

- Create, edit, and deactivate menu items.
- Define prices in Iranian toman.
- Define ingredients and descriptions for each item.
- Define the preparation time for each item.
- Define the available quantity of each item.
- Update menu availability and prices.

The menu will be designed to accommodate different preparation patterns, including fast food, kebabs, and Iranian dishes such as khoresh.

Menu changes will be reflected in the waiter interface without requiring a manual refresh.

### 6.2 Order management

Waiters will be able to:

- Create and view orders for restaurant tables.
- Add items and quantities.
- Record special instructions.
- Submit orders to the kitchen.
- Add further items to an existing table order.
- Track item and order preparation status.
- View the estimated readiness time for the order.
- View historical order information.

The system will preserve the price and item description applicable when an order is confirmed.

### 6.3 Preparation time and service coordination

Each menu item will have an estimated preparation duration.

The system will calculate readiness estimates using:

- Preparation requirements of individual items.
- The current preparation progress of existing items.
- Newly ordered items.
- The relationship between items that can be prepared simultaneously and items that must be prepared sequentially.

For example, if a table has an existing order for kebab and the customer adds a khoresh, the system will calculate the revised estimate using the remaining preparation time of the existing order and the preparation requirements of the new item.

The estimate will represent when the complete order is expected to be ready, rather than simply adding every item's preparation duration together.

Kitchen staff will be able to update preparation status, allowing the system to revise estimates as actual preparation progresses.

The estimate is intended to support waiter-to-kitchen coordination and customer communication. It is not a guaranteed delivery time.

### 6.4 Menu Availability and Daily Stock

Restaurant owners can define the available quantity of each menu item for a given business day.

- Each menu item has a configurable daily availability.
- The system tracks the remaining quantity as orders are confirmed.
- Available quantities are shared across all waiters and updated in real time.
- When the remaining quantity reaches zero, the item is automatically marked as unavailable.
- Restaurant owners can manually adjust availability during the day, including increasing or decreasing the remaining quantity.
- Changes to availability are recorded so the restaurant can review adjustments later.
- At the beginning of each business day, availability is initialized from the restaurant's configured daily quantities.

The system will distinguish between the configured daily quantity, quantities reserved by confirmed orders, and the remaining available quantity.

Concurrent orders will use atomic reservations to ensure that the available quantity cannot be exceeded.

For the MVP, daily availability will be managed at the menu-item level rather than through ingredient-level inventory tracking.

### 6.5 Kitchen operations

Kitchen staff will be able to:

- View incoming orders in chronological order.
- See individual items, quantities, notes, and preparation estimates.
- Mark items as preparing, ready, or cancelled where permitted.
- View which items belong to the same table order.
- See updated estimates when additional items are ordered.

The kitchen interface will update without requiring a full page reload.

### 6.6 Authentication and authorization

- Require authentication for operational screens.
- Restrict actions according to user role.
- Enforce restaurant-level data isolation on the backend.
- Prevent users from modifying orders or menu data belonging to another restaurant.

## 7. Platform and Data Strategy

The platform will maintain a consistent source of truth for restaurant operations.

The data model will be based on business entities rather than individual screens, allowing future workflows to reuse existing records.

The initial architecture will support:

- Restaurants and branches.
- Users and roles.
- Menu items, ingredients, prices, and availability.
- Tables and orders.
- Individual order items and their preparation status.
- Order history and relevant timestamps.
- Historical prices and item descriptions.

Order records will preserve the information applicable at the time of confirmation, so future menu changes will not alter historical orders.

The data model will support future reporting on sales, preparation times, menu performance, and branch-level activity.

Advanced reporting and analytics are not part of the MVP.

## 8. Non-Functional Requirements

### Data integrity

Concurrent modifications must not silently overwrite each other.

The backend will validate state transitions and use database transactions where necessary.

Availability reservations must be atomic to prevent overselling.

### Security

- Enforce restaurant-level data isolation on the backend.
- Validate and authorize all incoming requests.
- Store passwords securely.
- Keep secrets outside the source repository.

### Reliability

- Display clear errors when an operation fails.
- Prevent duplicate order submissions.
- Preserve confirmed orders across page reloads.
- Provide a usable interface on common mobile and desktop screen sizes.
- Keep the core ordering workflow operational if the AI provider is unavailable.

### Usability

The application must be usable by restaurant staff with minimal training.

The main waiter and kitchen workflows should require minimal navigation and remain usable during a busy service.

## 9. AI Capability

The MVP will include an optional AI-generated daily service summary.

The summary may identify:

- Most frequently ordered items.
- Unusually busy periods.
- Basic sales trends.

The AI will receive only the minimum aggregated data required.

If the AI provider is unavailable, the core restaurant workflow will continue to function normally.

AI-generated insights will be informational and will not modify orders, prices, or availability.

## 10. Explicitly Out of Scope

The first version will not include:

- Online payment processing.
- Payment gateway integration.
- Inventory and supplier management.
- Automatic currency conversion or exchange-rate synchronization.
- Accounting and tax reporting.
- Delivery management.
- Customer loyalty programs.
- Customer-facing mobile applications.
- Advanced employee scheduling.
- Multi-branch operational management.
- Advanced analytics and reporting.
- Sophisticated kitchen capacity optimization.

The architecture will accommodate these capabilities, but they will be developed only when justified by customer needs.

## 11. Success Criteria

The MVP will be considered successful when:

- A waiter can create and submit an order without assistance.
- Kitchen staff can receive and update orders during a service.
- Waiters can reliably see preparation progress and estimated readiness.
- Adding items to an existing order updates the overall estimate correctly.
- Concurrent updates do not silently overwrite confirmed changes.
- Two waiters cannot reserve the same remaining portion of a dish.
- Menu prices, ingredients, and availability are consistent across waiter interfaces.
- Users cannot access another restaurant's data.
- Historical order data remains consistent and available.
- The application can be used with realistic seeded restaurant data.
- The complete workflow passes an automated end-to-end test.

## 12. Assumptions and Constraints

- The initial deployment targets one restaurant branch.
- Staff have access to a smartphone, tablet, or computer with a modern browser.
- The restaurant has a stable internet connection.
- The restaurant owner maintains menu prices and availability.
- Preparation estimates are based on restaurant-defined durations and observed preparation progress.
- Existing POS and payment processes will remain in use.
- Development is limited to six hours.
- The product will be deployed as a SaaS application with restaurant-level data isolation.

## 13. Deliverables

- Deployed web application.
- Authentication and role-based access control.
- Waiter-to-kitchen order workflow.
- Menu management with prices, ingredients, and availability.
- Item-level preparation estimates and order readiness calculation.
- Shared availability management with concurrent reservation protection.
- Multi-tenant database schema with migrations.
- Realistic seed data.
- Automated tests for critical workflows.
- Local development setup and architecture documentation.
- Demo credentials for each role.
- Known limitations and future development priorities.
