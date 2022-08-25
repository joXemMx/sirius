/*
 *
 *  This file is part of the SIRIUS library for analyzing MS and MS/MS data
 *
 *  Copyright (C) 2013-2020 Kai Dührkop, Markus Fleischauer, Marcus Ludwig, Martin A. Hoffman, Fleming Kretschmer and Sebastian Böcker,
 *  Chair of Bioinformatics, Friedrich-Schilller University.
 *
 *  This library is free software; you can redistribute it and/or
 *  modify it under the terms of the GNU Lesser General Public
 *  License as published by the Free Software Foundation; either
 *  version 3 of the License, or (at your option) any later version.
 *
 *  This library is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
 *  Lesser General Public License for more details.
 *
 *  You should have received a copy of the GNU Lesser General Public License along with SIRIUS. If not, see <https://www.gnu.org/licenses/lgpl-3.0.txt>
 */

package de.unijena.bioinf.ms.middleware.compute.model;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Getter;
import lombok.Setter;
import org.jetbrains.annotations.Nullable;

import java.util.List;

/**
 * Identifier created by the SIRIUS Nightsky API for a newly created Job.
 * Object can be enriched with Job status/progress information ({@link JobProgress}) and/or Job command information.
 */
@Getter
@Setter
@JsonInclude(JsonInclude.Include.NON_NULL)
public class JobId {
    /**
     * Unique identifier to access the job via the API
     */
    String id;
    /**
     * Command string of the executed Task
     */
    @Nullable
    String command;

    /**
     * Optional progress information of this job
     */
    @Nullable
    JobProgress progress;

    /**
     * List of compound ids that are affected by this job.
     * If this job is creating compounds (e.g. data import jobs) this value will be 0 until the jobs has finished
     */
    @Nullable
    List<String> affectedCompoundIds;
}
