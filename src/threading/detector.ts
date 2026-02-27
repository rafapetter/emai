import type { Email, EmailAddress, Thread } from '../core/types.js';
import { normalizeSubject, generateId } from '../core/utils.js';

export interface TreeNode {
  email: Email;
  children: TreeNode[];
  depth: number;
}

const THREAD_TIME_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export class ThreadDetector {
  detectThreads(emails: Email[]): Thread[] {
    if (emails.length === 0) return [];

    const messageIdMap = new Map<string, Email>();
    for (const email of emails) {
      if (email.headers.messageId) {
        messageIdMap.set(email.headers.messageId, email);
      }
    }

    const groups = this.groupByHeaders(emails, messageIdMap);
    this.mergeBySubject(emails, groups);

    const threads: Thread[] = [];
    const assigned = new Set<string>();

    for (const group of groups.values()) {
      const unassigned = group.filter((e) => !assigned.has(e.id));
      if (unassigned.length === 0) continue;

      for (const e of unassigned) assigned.add(e.id);
      threads.push(this.buildThread(unassigned));
    }

    const remaining = emails.filter((e) => !assigned.has(e.id));
    for (const email of remaining) {
      threads.push(this.buildThread([email]));
    }

    threads.sort((a, b) => b.lastDate.getTime() - a.lastDate.getTime());
    return threads;
  }

  buildThread(emails: Email[]): Thread {
    const sorted = [...emails].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );

    const participantMap = new Map<string, EmailAddress>();
    const labelSet = new Set<string>();

    for (const email of sorted) {
      this.addParticipant(participantMap, email.from);
      for (const addr of email.to) this.addParticipant(participantMap, addr);
      for (const addr of email.cc ?? []) this.addParticipant(participantMap, addr);
      for (const label of email.labels ?? []) labelSet.add(label);
    }

    const lastEmail = sorted[sorted.length - 1];
    const subject = this.pickSubject(sorted);

    return {
      id: sorted[0].threadId ?? generateId(),
      subject,
      emails: sorted,
      participants: Array.from(participantMap.values()),
      lastDate: lastEmail.date,
      messageCount: sorted.length,
      labels: Array.from(labelSet),
      snippet: lastEmail.snippet ?? lastEmail.body?.text?.slice(0, 200),
    };
  }

  addToThread(thread: Thread, email: Email): Thread {
    const exists = thread.emails.some((e) => e.id === email.id);
    if (exists) return thread;

    const emails = [...thread.emails, email];
    return this.buildThread(emails);
  }

  findThread(email: Email, threads: Thread[]): Thread | null {
    const headerMatch = this.findByHeaders(email, threads);
    if (headerMatch) return headerMatch;

    const subjectMatch = this.findBySubject(email, threads);
    if (subjectMatch) return subjectMatch;

    return null;
  }

  getConversationTree(thread: Thread): TreeNode[] {
    const emailMap = new Map<string, Email>();
    const messageIdToEmail = new Map<string, Email>();

    for (const email of thread.emails) {
      emailMap.set(email.id, email);
      if (email.headers.messageId) {
        messageIdToEmail.set(email.headers.messageId, email);
      }
    }

    const childToParent = new Map<string, string>();
    for (const email of thread.emails) {
      if (email.headers.inReplyTo) {
        const parent = messageIdToEmail.get(email.headers.inReplyTo);
        if (parent) {
          childToParent.set(email.id, parent.id);
        }
      }
    }

    const roots: Email[] = [];
    const childrenMap = new Map<string, Email[]>();

    for (const email of thread.emails) {
      const parentId = childToParent.get(email.id);
      if (!parentId) {
        roots.push(email);
      } else {
        const existing = childrenMap.get(parentId) ?? [];
        existing.push(email);
        childrenMap.set(parentId, existing);
      }
    }

    roots.sort((a, b) => a.date.getTime() - b.date.getTime());

    const buildNode = (email: Email, depth: number): TreeNode => {
      const children = (childrenMap.get(email.id) ?? [])
        .sort((a, b) => a.date.getTime() - b.date.getTime())
        .map((child) => buildNode(child, depth + 1));

      return { email, children, depth };
    };

    return roots.map((root) => buildNode(root, 0));
  }

  private groupByHeaders(
    emails: Email[],
    messageIdMap: Map<string, Email>,
  ): Map<string, Email[]> {
    const groups = new Map<string, Email[]>();
    const emailToGroup = new Map<string, string>();

    const getOrCreateGroup = (groupKey: string, email: Email): string => {
      const existing = emailToGroup.get(email.id);
      if (existing) return existing;

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(email);
      emailToGroup.set(email.id, groupKey);
      return groupKey;
    };

    const mergeGroups = (keyA: string, keyB: string): string => {
      if (keyA === keyB) return keyA;
      const groupA = groups.get(keyA) ?? [];
      const groupB = groups.get(keyB) ?? [];
      const merged = [...groupA, ...groupB];

      const primaryKey = keyA;
      groups.set(primaryKey, merged);
      groups.delete(keyB);

      for (const e of merged) {
        emailToGroup.set(e.id, primaryKey);
      }
      return primaryKey;
    };

    for (const email of emails) {
      let groupKey = emailToGroup.get(email.id) ?? email.headers.messageId ?? email.id;
      groupKey = getOrCreateGroup(groupKey, email);

      if (email.headers.inReplyTo) {
        const parent = messageIdMap.get(email.headers.inReplyTo);
        if (parent) {
          const parentGroup = emailToGroup.get(parent.id);
          if (parentGroup) {
            groupKey = mergeGroups(parentGroup, groupKey);
          } else {
            getOrCreateGroup(groupKey, parent);
          }
        }
      }

      if (email.headers.references) {
        for (const ref of email.headers.references) {
          const refEmail = messageIdMap.get(ref);
          if (refEmail) {
            const refGroup = emailToGroup.get(refEmail.id);
            if (refGroup && refGroup !== groupKey) {
              groupKey = mergeGroups(groupKey, refGroup);
            } else if (!refGroup) {
              getOrCreateGroup(groupKey, refEmail);
            }
          }
        }
      }
    }

    return groups;
  }

  private mergeBySubject(
    emails: Email[],
    groups: Map<string, Email[]>,
  ): void {
    const assignedIds = new Set<string>();
    for (const group of groups.values()) {
      for (const e of group) assignedIds.add(e.id);
    }

    const unassigned = emails.filter((e) => !assignedIds.has(e.id));
    if (unassigned.length === 0) return;

    const subjectIndex = new Map<string, string[]>();
    for (const [key, group] of groups) {
      for (const email of group) {
        const norm = normalizeSubject(email.subject).toLowerCase();
        if (!norm) continue;
        const keys = subjectIndex.get(norm) ?? [];
        if (!keys.includes(key)) keys.push(key);
        subjectIndex.set(norm, keys);
      }
    }

    for (const email of unassigned) {
      const norm = normalizeSubject(email.subject).toLowerCase();
      if (!norm) continue;

      const candidateKeys = subjectIndex.get(norm);
      if (!candidateKeys || candidateKeys.length === 0) {
        const newKey = email.headers.messageId ?? email.id;
        groups.set(newKey, [email]);
        const keys = subjectIndex.get(norm) ?? [];
        keys.push(newKey);
        subjectIndex.set(norm, keys);
        assignedIds.add(email.id);
        continue;
      }

      let bestKey: string | null = null;
      let bestScore = 0;

      for (const key of candidateKeys) {
        const group = groups.get(key);
        if (!group) continue;

        const withinWindow = group.some(
          (e) => Math.abs(e.date.getTime() - email.date.getTime()) < THREAD_TIME_WINDOW_MS,
        );
        if (!withinWindow) continue;

        const overlapScore = this.participantOverlap(email, group);
        if (overlapScore > bestScore) {
          bestScore = overlapScore;
          bestKey = key;
        }
      }

      if (bestKey && bestScore > 0) {
        groups.get(bestKey)!.push(email);
        assignedIds.add(email.id);
      } else if (candidateKeys.length > 0) {
        const firstKey = candidateKeys[0];
        const group = groups.get(firstKey);
        if (
          group &&
          group.some(
            (e) =>
              Math.abs(e.date.getTime() - email.date.getTime()) <
              THREAD_TIME_WINDOW_MS,
          )
        ) {
          group.push(email);
          assignedIds.add(email.id);
        }
      }
    }
  }

  private participantOverlap(email: Email, group: Email[]): number {
    const emailAddrs = this.collectAddresses(email);
    const groupAddrs = new Set<string>();
    for (const e of group) {
      for (const addr of this.collectAddresses(e)) {
        groupAddrs.add(addr);
      }
    }

    let overlap = 0;
    for (const addr of emailAddrs) {
      if (groupAddrs.has(addr)) overlap++;
    }

    return emailAddrs.size === 0 ? 0 : overlap / emailAddrs.size;
  }

  private collectAddresses(email: Email): Set<string> {
    const addrs = new Set<string>();
    addrs.add(email.from.address.toLowerCase());
    for (const a of email.to) addrs.add(a.address.toLowerCase());
    for (const a of email.cc ?? []) addrs.add(a.address.toLowerCase());
    return addrs;
  }

  private findByHeaders(email: Email, threads: Thread[]): Thread | null {
    if (email.headers.inReplyTo) {
      for (const thread of threads) {
        for (const e of thread.emails) {
          if (e.headers.messageId === email.headers.inReplyTo) {
            return thread;
          }
        }
      }
    }

    if (email.headers.references?.length) {
      for (const ref of email.headers.references) {
        for (const thread of threads) {
          for (const e of thread.emails) {
            if (e.headers.messageId === ref) {
              return thread;
            }
          }
        }
      }
    }

    return null;
  }

  private findBySubject(email: Email, threads: Thread[]): Thread | null {
    const norm = normalizeSubject(email.subject).toLowerCase();
    if (!norm) return null;

    let best: Thread | null = null;
    let bestScore = 0;

    for (const thread of threads) {
      const threadNorm = normalizeSubject(thread.subject).toLowerCase();
      if (threadNorm !== norm) continue;

      const withinWindow = thread.emails.some(
        (e) =>
          Math.abs(e.date.getTime() - email.date.getTime()) <
          THREAD_TIME_WINDOW_MS,
      );
      if (!withinWindow) continue;

      const score = this.participantOverlap(email, thread.emails);
      if (score > bestScore) {
        bestScore = score;
        best = thread;
      }
    }

    return best;
  }

  private addParticipant(
    map: Map<string, EmailAddress>,
    addr: EmailAddress,
  ): void {
    const key = addr.address.toLowerCase();
    if (!map.has(key)) {
      map.set(key, addr);
    } else if (addr.name && !map.get(key)!.name) {
      map.set(key, addr);
    }
  }

  private pickSubject(emails: Email[]): string {
    for (const email of emails) {
      const norm = normalizeSubject(email.subject);
      if (norm) return norm;
    }
    return emails[0]?.subject ?? '(no subject)';
  }
}
