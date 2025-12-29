# Access Cases and Test Coverage

1. A system admin in a world context can see the world admin panel. Tested: Yes (`backend/src/__tests__/api.test.ts`: "grants admin and architect access to world admin").
2. A world architect in a world context can see the world admin panel. Tested: Yes (`backend/src/__tests__/api.test.ts`: "grants admin and architect access to world admin").
3. A viewer in a world context cannot see the world admin panel. Tested: Yes (`backend/src/__tests__/api.test.ts`: "denies non-architect access to world admin").
4. A world architect in a world context can see entity types for that world. Tested: Yes (`backend/src/__tests__/api.test.ts`: "allows architects to list entity types and fields by world").
5. A world architect in a world context can see entity fields for that world. Tested: Yes (`backend/src/__tests__/api.test.ts`: "allows architects to list entity types and fields by world").
6. A viewer in a world context cannot see entity types for that world. Tested: Yes (`backend/src/__tests__/api.test.ts`: "denies non-architect access to entity types and fields by world").
7. A viewer in a world context cannot see entity fields for that world. Tested: Yes (`backend/src/__tests__/api.test.ts`: "denies non-architect access to entity types and fields by world").
8. A system admin in a world context can create an entity type. Tested: Yes (`backend/src/__tests__/api.test.ts`: "allows admins and architects to create entity types").
9. A world architect in a world context can create an entity type. Tested: Yes (`backend/src/__tests__/api.test.ts`: "allows admins and architects to create entity types").
10. A viewer in a world context cannot create an entity type. Tested: Yes (`backend/src/__tests__/api.test.ts`: "blocks viewers from creating entity types").
11. A world architect in a world context can create an entity field. Tested: Yes (`backend/src/__tests__/api.test.ts`: "allows architects to create fields and choices").
12. A world architect in a world context can create an entity field choice. Tested: Yes (`backend/src/__tests__/api.test.ts`: "allows architects to create fields and choices").
13. A viewer in a world context cannot create an entity field. Tested: Yes (`backend/src/__tests__/api.test.ts`: "blocks viewers from creating fields and choices").
14. A viewer in a world context cannot create an entity field choice. Tested: Yes (`backend/src/__tests__/api.test.ts`: "blocks viewers from creating fields and choices").
15. A system admin in a world context can create a relationship type. Tested: Yes (`backend/src/__tests__/api.test.ts`: "creates relationship types and rules").
16. A viewer in a world context cannot create a relationship type. Tested: Yes (`backend/src/__tests__/api.test.ts`: "blocks viewers from creating relationship types").
17. A system admin in a world context can create a relationship type rule. Tested: Yes (`backend/src/__tests__/api.test.ts`: "creates relationship types and rules").
18. A system admin in a world context cannot create a duplicate relationship type rule. Tested: Yes (`backend/src/__tests__/api.test.ts`: "prevents duplicate relationship type rules").
19. A system admin in a world context cannot delete a relationship type that still has rules. Tested: Yes (`backend/src/__tests__/api.test.ts`: "prevents deleting relationship types with rules").
20. A world GM in a world context can create a campaign. Tested: Yes (`backend/src/__tests__/api.test.ts`: "allows world GMs to create campaigns").
21. A non-GM in a world context cannot create a campaign. Tested: Yes (`backend/src/__tests__/api.test.ts`: "blocks non-GM users from creating campaigns").
22. A player in a world context can see campaigns they are a player in. Tested: Yes (`backend/src/__tests__/api.test.ts`: "shows campaigns where the user is a player").
23. A user in a campaign context can see characters filtered by that campaign. Tested: Yes (`backend/src/__tests__/api.test.ts`: "filters characters by campaign").
24. A user in a character context can see campaigns filtered by that character. Tested: Yes (`backend/src/__tests__/api.test.ts`: "filters campaigns by character").
25. A campaign GM in a campaign context can see owner labels in character references. Tested: Yes (`backend/src/__tests__/api.test.ts`: "includes ownerLabel for character references when GM").
26. A campaign GM in a campaign context can see all world characters when adding to a campaign. Tested: Yes (`backend/src/__tests__/api.test.ts`: "shows campaign GM all world characters when adding to a campaign").
27. A user in world + campaign + character context can see role summary (world/campaign/character roles). Tested: Yes (`backend/src/__tests__/api.test.ts`: "returns context summary roles").
28. An unrelated user in a world context cannot see that world in the worlds list. Tested: Yes (`backend/src/__tests__/api.test.ts`: "hides worlds from unrelated users").
29. An unrelated user in a campaign context cannot see that campaign's detail. Tested: Yes (`backend/src/__tests__/api.test.ts`: "blocks unrelated users from campaign and character detail").
30. An unrelated user in a character context cannot see that character's detail. Tested: Yes (`backend/src/__tests__/api.test.ts`: "blocks unrelated users from campaign and character detail").
31. A system admin in a world context can add a character to a campaign via related lists. Tested: Yes (`backend/src/__tests__/api.test.ts`: "adds and fetches related characters").
32. A system admin in a world context can add a world character creator via related lists. Tested: Yes (`backend/src/__tests__/api.test.ts`: "adds world character creators").
33. A user without campaign context cannot create a shared note. Tested: Yes (`backend/src/__tests__/api.test.ts`: "requires campaign context for shared notes").
34. A player without character context cannot create a private note. Tested: Yes (`backend/src/__tests__/api.test.ts`: "blocks players from authoring without character context").
35. An unrelated user in campaign context can see shared notes but not private notes. Tested: Yes (`backend/src/__tests__/api.test.ts`: "returns shared notes to unrelated users but hides private notes").
36. A campaign GM in campaign context can see all notes in that campaign. Tested: Yes (`backend/src/__tests__/api.test.ts`: "shows campaign GMs all notes in that campaign").
37. A player in campaign + character context can see their own private notes. Tested: Yes (`backend/src/__tests__/api.test.ts`: "shows players their own private notes in campaign context").
38. A user in campaign + character context can see mentions from accessible entities. Tested: Yes (`backend/src/__tests__/api.test.ts`: "returns mentions from accessible entities").
39. A user in campaign context without character context cannot see mentions from character-scoped entities. Tested: Yes (`backend/src/__tests__/api.test.ts`: "hides mentions from character-scoped entities without character context").
40. A user cannot see mentions when the target entity is unreadable. Tested: Yes (`backend/src/__tests__/api.test.ts`: "blocks mentions when the target entity is not readable").
41. A world architect in a world context can create a location type. Tested: Yes (`backend/src/__tests__/api.test.ts`: "allows architects to create location types and fields").
42. A world architect in a world context can create a location type field. Tested: Yes (`backend/src/__tests__/api.test.ts`: "allows architects to create location types and fields").
43. A viewer in a world context cannot create a location type. Tested: Yes (`backend/src/__tests__/api.test.ts`: "blocks viewers from creating location types").
44. A user in a world context can create a location when parent type rules allow it. Tested: Yes (`backend/src/__tests__/api.test.ts`: "enforces location type rules for parent selection and deny overrides").
45. A user in a world context cannot create a location when parent type rules deny it. Tested: Yes (`backend/src/__tests__/api.test.ts`: "enforces location type rules for parent selection and deny overrides").
46. A user in a world context cannot reparent a location to create a cycle. Tested: Yes (`backend/src/__tests__/api.test.ts`: "prevents location cycles when reparenting").
47. A user in a world context can see location field values in list views when requested. Tested: Yes (`backend/src/__tests__/api.test.ts`: "returns location field values in list view when requested").
48. A user in a campaign/character context can see relationships only if the base entity is readable. Tested: Yes (`backend/src/__tests__/api.test.ts`: "blocks relationship lists when the base entity is unreadable").
49. A user in a campaign/character context cannot see relationships when the other entity is unreadable. Tested: Yes (`backend/src/__tests__/api.test.ts`: "enforces entity access when listing relationships").
50. A user in a campaign context can see campaign-scoped relationships, while the same user without campaign context cannot. Tested: Yes (`backend/src/__tests__/api.test.ts`: "enforces relationship visibility scopes").
