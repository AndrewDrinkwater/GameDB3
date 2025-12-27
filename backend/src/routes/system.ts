import express from "express";
import bcrypt from "bcryptjs";
import { PropertyValueType, RelatedListFieldSource, Role, SystemViewType } from "@prisma/client";
import { prisma, requireAuth, requireSystemAdmin } from "../lib/helpers";

export const registerSystemRoutes = (app: express.Express) => {
  app.put("/api/views/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    const { id } = req.params;
    const { key, title, entityKey, viewType, endpoint, description, adminOnly } = req.body as {
      key?: string;
      title?: string;
      entityKey?: string;
      viewType?: string;
      endpoint?: string;
      description?: string;
      adminOnly?: boolean;
    };
  
    const viewTypeValue =
      viewType && Object.values(SystemViewType).includes(viewType as SystemViewType)
        ? (viewType as SystemViewType)
        : undefined;
  
    const view = await prisma.systemView.update({
      where: { id },
      data: { key, title, entityKey, viewType: viewTypeValue, endpoint, description, adminOnly }
    });
    res.json(view);
  });

  app.delete("/api/views/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    await prisma.systemView.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  });

  app.get("/api/system/properties", requireAuth, requireSystemAdmin, async (_req, res) => {
    const properties = await prisma.systemProperty.findMany({ orderBy: { key: "asc" } });
    res.json(properties);
  });

  app.get("/api/system/properties/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    const property = await prisma.systemProperty.findUnique({ where: { id: req.params.id } });
    if (!property) {
      res.status(404).json({ error: "Property not found." });
      return;
    }
    res.json(property);
  });

  app.post("/api/system/properties", requireAuth, requireSystemAdmin, async (req, res) => {
    const { key, valueType, value, description } = req.body as {
      key?: string;
      valueType?: string;
      value?: string;
      description?: string;
    };
  
    if (!key || !valueType || value === undefined) {
      res.status(400).json({ error: "key, valueType, and value are required." });
      return;
    }
  
    if (!Object.values(PropertyValueType).includes(valueType as PropertyValueType)) {
      res.status(400).json({ error: "Invalid valueType." });
      return;
    }
  
    const property = await prisma.systemProperty.create({
      data: { key, valueType: valueType as PropertyValueType, value, description }
    });
    res.status(201).json(property);
  });

  app.put("/api/system/properties/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    const { id } = req.params;
    const { key, valueType, value, description } = req.body as {
      key?: string;
      valueType?: string;
      value?: string;
      description?: string;
    };
  
    const valueTypeValue =
      valueType && Object.values(PropertyValueType).includes(valueType as PropertyValueType)
        ? (valueType as PropertyValueType)
        : undefined;
  
    const property = await prisma.systemProperty.update({
      where: { id },
      data: { key, valueType: valueTypeValue, value, description }
    });
    res.json(property);
  });

  app.delete("/api/system/properties/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    await prisma.systemProperty.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  });
  
  app.get(
    "/api/system/preference-defaults",
    requireAuth,
    requireSystemAdmin,
    async (_req, res) => {
      const defaults = await prisma.systemUserPreferenceDefault.findMany({
        orderBy: { key: "asc" }
      });
      res.json(defaults);
    }
  );
  
  app.post(
    "/api/system/preference-defaults",
    requireAuth,
    requireSystemAdmin,
    async (req, res) => {
      const { key, valueType, value, description } = req.body as {
        key?: string;
        valueType?: string;
        value?: string;
        description?: string;
      };
  
      if (!key || !valueType || value === undefined) {
        res.status(400).json({ error: "key, valueType, and value are required." });
        return;
      }
  
      if (!Object.values(PropertyValueType).includes(valueType as PropertyValueType)) {
        res.status(400).json({ error: "Invalid valueType." });
        return;
      }
  
      const prefDefault = await prisma.systemUserPreferenceDefault.create({
        data: { key, valueType: valueType as PropertyValueType, value, description }
      });
      res.status(201).json(prefDefault);
    }
  );
  
  app.put(
    "/api/system/preference-defaults/:id",
    requireAuth,
    requireSystemAdmin,
    async (req, res) => {
      const { id } = req.params;
      const { key, valueType, value, description } = req.body as {
        key?: string;
        valueType?: string;
        value?: string;
        description?: string;
      };
  
      const valueTypeValue =
        valueType && Object.values(PropertyValueType).includes(valueType as PropertyValueType)
          ? (valueType as PropertyValueType)
          : undefined;
  
      const prefDefault = await prisma.systemUserPreferenceDefault.update({
        where: { id },
        data: { key, valueType: valueTypeValue, value, description }
      });
      res.json(prefDefault);
    }
  );
  
  app.delete(
    "/api/system/preference-defaults/:id",
    requireAuth,
    requireSystemAdmin,
    async (req, res) => {
      await prisma.systemUserPreferenceDefault.delete({ where: { id: req.params.id } });
      res.json({ ok: true });
    }
  );

  app.get("/api/system/choices", requireAuth, requireSystemAdmin, async (_req, res) => {
    const choices = await prisma.systemChoice.findMany({
      orderBy: [{ listKey: "asc" }, { sortOrder: "asc" }]
    });
    res.json(choices);
  });

  app.get("/api/system/choices/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    const choice = await prisma.systemChoice.findUnique({
      where: { id: req.params.id }
    });
    if (!choice) {
      res.status(404).json({ error: "Choice not found." });
      return;
    }
    res.json(choice);
  });

  app.post("/api/system/choices", requireAuth, requireSystemAdmin, async (req, res) => {
    const { listKey, value, label, sortOrder, isActive, pillColor, textColor } = req.body as {
      listKey?: string;
      value?: string;
      label?: string;
      sortOrder?: number;
      isActive?: boolean;
      pillColor?: string | null;
      textColor?: string | null;
    };
  
    if (!listKey || !value || !label) {
      res.status(400).json({ error: "listKey, value, and label are required." });
      return;
    }
  
    const choice = await prisma.systemChoice.create({
      data: { listKey, value, label, sortOrder, isActive, pillColor, textColor }
    });
    res.status(201).json(choice);
  });

  app.put("/api/system/choices/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    const { id } = req.params;
    const { listKey, value, label, sortOrder, isActive, pillColor, textColor } = req.body as {
      listKey?: string;
      value?: string;
      label?: string;
      sortOrder?: number;
      isActive?: boolean;
      pillColor?: string | null;
      textColor?: string | null;
    };
  
    const choice = await prisma.systemChoice.update({
      where: { id },
      data: { listKey, value, label, sortOrder, isActive, pillColor, textColor }
    });
    res.json(choice);
  });

  app.delete("/api/system/choices/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    await prisma.systemChoice.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  });

  app.get("/api/system/roles", requireAuth, requireSystemAdmin, async (_req, res) => {
    const roles = await prisma.systemRole.findMany({ orderBy: { name: "asc" } });
    res.json(roles);
  });

  app.post("/api/system/roles", requireAuth, requireSystemAdmin, async (req, res) => {
    const { key, name, description } = req.body as {
      key?: string;
      name?: string;
      description?: string;
    };
  
    if (!key || !name) {
      res.status(400).json({ error: "key and name are required." });
      return;
    }
  
    const role = await prisma.systemRole.create({ data: { key, name, description } });
    res.status(201).json(role);
  });

  app.put("/api/system/roles/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    const { id } = req.params;
    const { key, name, description } = req.body as {
      key?: string;
      name?: string;
      description?: string;
    };
  
    const role = await prisma.systemRole.update({
      where: { id },
      data: { key, name, description }
    });
    res.json(role);
  });

  app.delete("/api/system/roles/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    await prisma.systemRole.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  });

  app.get("/api/system/controls", requireAuth, requireSystemAdmin, async (_req, res) => {
    const controls = await prisma.systemControl.findMany({ orderBy: { key: "asc" } });
    res.json(controls);
  });

  app.get("/api/system/controls/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    const control = await prisma.systemControl.findUnique({
      where: { id: req.params.id }
    });
    if (!control) {
      res.status(404).json({ error: "Control not found." });
      return;
    }
    res.json(control);
  });

  app.post("/api/system/controls", requireAuth, requireSystemAdmin, async (req, res) => {
    const { key, description } = req.body as { key?: string; description?: string };
  
    if (!key) {
      res.status(400).json({ error: "key is required." });
      return;
    }
  
    const control = await prisma.systemControl.create({ data: { key, description } });
    res.status(201).json(control);
  });

  app.put("/api/system/controls/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    const { id } = req.params;
    const { key, description } = req.body as { key?: string; description?: string };
  
    const control = await prisma.systemControl.update({
      where: { id },
      data: { key, description }
    });
    res.json(control);
  });

  app.delete("/api/system/controls/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    await prisma.systemControl.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  });

  app.get("/api/system/related-lists", requireAuth, requireSystemAdmin, async (_req, res) => {
    const relatedLists = await prisma.systemRelatedList.findMany({
      orderBy: { listOrder: "asc" }
    });
    res.json(relatedLists);
  });
  
  app.get(
    "/api/system/related-lists/:id",
    requireAuth,
    requireSystemAdmin,
    async (req, res) => {
      const relatedList = await prisma.systemRelatedList.findUnique({
        where: { id: req.params.id }
      });
      if (!relatedList) {
        res.status(404).json({ error: "Related list not found." });
        return;
      }
      res.json(relatedList);
    }
  );

  app.post("/api/system/related-lists", requireAuth, requireSystemAdmin, async (req, res) => {
    const {
      key,
      title,
      parentEntityKey,
      relatedEntityKey,
      joinEntityKey,
      parentFieldKey,
      relatedFieldKey,
      listOrder,
      adminOnly
    } = req.body as {
      key?: string;
      title?: string;
      parentEntityKey?: string;
      relatedEntityKey?: string;
      joinEntityKey?: string;
      parentFieldKey?: string;
      relatedFieldKey?: string;
      listOrder?: number;
      adminOnly?: boolean;
    };
  
    if (
      !key ||
      !title ||
      !parentEntityKey ||
      !relatedEntityKey ||
      !joinEntityKey ||
      !parentFieldKey ||
      !relatedFieldKey
    ) {
      res.status(400).json({ error: "Missing required fields." });
      return;
    }
  
    const relatedList = await prisma.systemRelatedList.create({
      data: {
        key,
        title,
        parentEntityKey,
        relatedEntityKey,
        joinEntityKey,
        parentFieldKey,
        relatedFieldKey,
        listOrder,
        adminOnly
      }
    });
  
    res.status(201).json(relatedList);
  });

  app.put("/api/system/related-lists/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    const { id } = req.params;
    const {
      key,
      title,
      parentEntityKey,
      relatedEntityKey,
      joinEntityKey,
      parentFieldKey,
      relatedFieldKey,
      listOrder,
      adminOnly
    } = req.body as {
      key?: string;
      title?: string;
      parentEntityKey?: string;
      relatedEntityKey?: string;
      joinEntityKey?: string;
      parentFieldKey?: string;
      relatedFieldKey?: string;
      listOrder?: number;
      adminOnly?: boolean;
    };
  
    const relatedList = await prisma.systemRelatedList.update({
      where: { id },
      data: {
        key,
        title,
        parentEntityKey,
        relatedEntityKey,
        joinEntityKey,
        parentFieldKey,
        relatedFieldKey,
        listOrder,
        adminOnly
      }
    });
  
    res.json(relatedList);
  });

  app.delete("/api/system/related-lists/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    await prisma.systemRelatedList.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  });
  
  app.get(
    "/api/system/related-list-fields",
    requireAuth,
    requireSystemAdmin,
    async (_req, res) => {
      const fields = await prisma.systemRelatedListField.findMany({
        orderBy: { listOrder: "asc" }
      });
      res.json(fields);
    }
  );
  
  app.get(
    "/api/system/related-list-fields/:id",
    requireAuth,
    requireSystemAdmin,
    async (req, res) => {
      const field = await prisma.systemRelatedListField.findUnique({
        where: { id: req.params.id }
      });
      if (!field) {
        res.status(404).json({ error: "Related list field not found." });
        return;
      }
      res.json(field);
    }
  );
  
  app.post(
    "/api/system/related-list-fields",
    requireAuth,
    requireSystemAdmin,
    async (req, res) => {
      const { relatedListId, fieldKey, label, source, listOrder, width } = req.body as {
        relatedListId?: string;
        fieldKey?: string;
        label?: string;
        source?: string;
        listOrder?: number;
        width?: string;
      };
  
      if (!relatedListId || !fieldKey || !label || !source || listOrder === undefined) {
        res.status(400).json({ error: "Missing required fields." });
        return;
      }
  
      if (!Object.values(RelatedListFieldSource).includes(source as RelatedListFieldSource)) {
        res.status(400).json({ error: "Invalid source." });
        return;
      }
  
      const field = await prisma.systemRelatedListField.create({
        data: {
          relatedListId,
          fieldKey,
          label,
          source: source as RelatedListFieldSource,
          listOrder,
          width
        }
      });
  
      res.status(201).json(field);
    }
  );
  
  app.put(
    "/api/system/related-list-fields/:id",
    requireAuth,
    requireSystemAdmin,
    async (req, res) => {
      const { id } = req.params;
      const { relatedListId, fieldKey, label, source, listOrder, width } = req.body as {
        relatedListId?: string;
        fieldKey?: string;
        label?: string;
        source?: string;
        listOrder?: number;
        width?: string;
      };
  
      const sourceValue =
        source && Object.values(RelatedListFieldSource).includes(source as RelatedListFieldSource)
          ? (source as RelatedListFieldSource)
          : undefined;
  
      const field = await prisma.systemRelatedListField.update({
        where: { id },
        data: { relatedListId, fieldKey, label, source: sourceValue, listOrder, width }
      });
  
      res.json(field);
    }
  );
  
  app.delete(
    "/api/system/related-list-fields/:id",
    requireAuth,
    requireSystemAdmin,
    async (req, res) => {
      await prisma.systemRelatedListField.delete({ where: { id: req.params.id } });
      res.json({ ok: true });
    }
  );

  app.get("/api/system/user-preferences", requireAuth, requireSystemAdmin, async (_req, res) => {
    const preferences = await prisma.systemUserPreference.findMany({
      orderBy: [{ userId: "asc" }, { key: "asc" }]
    });
    res.json(preferences);
  });

  app.get("/api/system/user-preferences/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    const preference = await prisma.systemUserPreference.findUnique({
      where: { id: req.params.id }
    });
    if (!preference) {
      res.status(404).json({ error: "Preference not found." });
      return;
    }
    res.json(preference);
  });

  app.post("/api/system/user-preferences", requireAuth, requireSystemAdmin, async (req, res) => {
    const { userId, key, valueType, value } = req.body as {
      userId?: string;
      key?: string;
      valueType?: string;
      value?: string;
    };
  
    if (!userId || !key || !valueType || value === undefined) {
      res.status(400).json({ error: "userId, key, valueType, and value are required." });
      return;
    }
  
    if (!Object.values(PropertyValueType).includes(valueType as PropertyValueType)) {
      res.status(400).json({ error: "Invalid valueType." });
      return;
    }
  
    const preference = await prisma.systemUserPreference.create({
      data: { userId, key, valueType: valueType as PropertyValueType, value }
    });
  
    res.status(201).json(preference);
  });

  app.put("/api/system/user-preferences/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    const { id } = req.params;
    const { userId, key, valueType, value } = req.body as {
      userId?: string;
      key?: string;
      valueType?: string;
      value?: string;
    };
  
    const valueTypeValue =
      valueType && Object.values(PropertyValueType).includes(valueType as PropertyValueType)
        ? (valueType as PropertyValueType)
        : undefined;
  
    const preference = await prisma.systemUserPreference.update({
      where: { id },
      data: { userId, key, valueType: valueTypeValue, value }
    });
    res.json(preference);
  });

  app.delete("/api/system/user-preferences/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    await prisma.systemUserPreference.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  });

  app.get("/api/system/users", requireAuth, requireSystemAdmin, async (_req, res) => {
    const users = await prisma.user.findMany({
      orderBy: { email: "asc" },
      select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true }
    });
    res.json(users);
  });

  app.get("/api/system/users/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true }
    });
    if (!user) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    res.json(user);
  });

  app.post("/api/system/users", requireAuth, requireSystemAdmin, async (req, res) => {
    const { email, name, role, password } = req.body as {
      email?: string;
      name?: string;
      role?: Role;
      password?: string;
    };
  
    if (!email || !role || !password) {
      res.status(400).json({ error: "email, role, and password are required." });
      return;
    }
  
    const passwordHash = await bcrypt.hash(password, 10);
  
    const user = await prisma.user.create({
      data: { email, name, role, passwordHash },
      select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true }
    });
  
    res.status(201).json(user);
  });

  app.put("/api/system/users/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    const { id } = req.params;
    const { email, name, role, password } = req.body as {
      email?: string;
      name?: string;
      role?: Role;
      password?: string;
    };
  
    const data: { email?: string; name?: string; role?: Role; passwordHash?: string } = {
      email,
      name,
      role
    };
  
    if (password) {
      data.passwordHash = await bcrypt.hash(password, 10);
    }
  
    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true }
    });
  
    res.json(user);
  });

  app.delete("/api/system/users/:id", requireAuth, requireSystemAdmin, async (req, res) => {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  });

};
